'use strict';
/*
 * Enrichissement des organisations par deux registres publics, gratuits et
 * hors EEE.
 *
 * Pourquoi ceux-la. Le pilote du 2026-08-26 a etabli que le web public ne rend
 * pas d'adresse nominative — inutile de le redemander. Ce que des registres
 * savent faire, en revanche, et que personne d'autre ne fait gratuitement :
 * dire qu'une societe EXISTE legalement, sous quel nom exact, dans quel pays,
 * et si elle est un investisseur declare. C'est de la qualification, pas du
 * canal : ca ne donne pas a qui ecrire, ca dit a qui cela vaut la peine.
 *
 *   GLEIF (fondation, Bale) — l'identifiant d'entite juridique mondial. Ouvert,
 *     sans cle, sans quota publie. Rend le LEI, le nom legal officiel, le pays
 *     du siege et l'etat de l'enregistrement.
 *   SEC EDGAR (Etats-Unis) — le registre des depots. Rend le CIK et les
 *     formulaires deposes : un 13F-HR designe un gerant institutionnel, un
 *     Form D un placement prive. Aucune cle ; l'agence impose un en-tete
 *     d'identification et 10 requetes par seconde au maximum.
 *
 * Le piege de ces deux sources est le meme : l'homonymie. « ADQ » ou « A15 »
 * trouvent une entite quelque part dans le monde, qui n'est pas la notre. D'ou
 * la regle de rapprochement ci-dessous, qui refuse plutot que de deviner.
 */
const { ecrireEnrichissements } = require('./enrichir');

// L'agence demande a savoir qui appelle ; une requete anonyme est refusee.
const UA = process.env.ENRICH_UA
  || 'Arx Consulting enrichissement benoit.p.g.sigwald@gmail.com';

/*
 * Formes juridiques seulement.
 *
 * « Capital », « Partners », « Ventures », « Group » n'entrent PAS dans cette
 * liste : ce sont des morceaux distinctifs du nom d'un fonds. Les rogner
 * ramenerait « Altis Capital » a « altis » et le confondrait avec toute autre
 * societe Altis du monde. Le premier jet faisait cette erreur.
 */
const SUFFIXES = ['sa', 'sas', 'sarl', 'sasu', 'sci', 'snc', 'gmbh', 'ag', 'bv',
  'nv', 'ltd', 'limited', 'llc', 'lp', 'llp', 'inc', 'corp', 'corporation',
  'plc', 'spa', 'srl', 'ab', 'oy', 'kft', 'pte', 'pty', 'kk', 'sl'];

/*
 * Normalisation pour comparer deux raisons sociales.
 *
 * On retire les accents, la ponctuation et les suffixes juridiques : « ALTIS
 * Capital SAS » et « Altis Capital » designent la meme societe. On ne retire
 * PAS les mots courts distinctifs — « A15 » doit rester « a15 ».
 */
function normaliser(nom) {
  const base = String(nom || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Les points tombent SANS laisser d espace : « L.P. » doit devenir « lp »,
    // une forme juridique reconnaissable, et non « l p », deux mots d une lettre.
    .replace(/\./g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const mots = base.split(' ').filter(Boolean);
  // On ne rogne que la fin, et jamais jusqu'a vider le nom.
  while (mots.length > 1 && SUFFIXES.includes(mots[mots.length - 1])) mots.pop();
  return mots.join(' ');
}

async function json(url, essais = 2) {
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (r.status === 429 || r.status >= 500) { await pause(1200); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await pause(600); }
  }
  return null;
}
const pause = ms => new Promise(s => setTimeout(s, ms));

/* ------------------------------------------------------------------ GLEIF */

/*
 * Rapprochement GLEIF.
 *
 * Le filtre par nom legal de GLEIF est large : il rend des entites dont le nom
 * ressemble, pas seulement celles dont le nom est le notre. Trois cas :
 *
 *   nom identique + pays identique  -> certain
 *   nom identique + pays inconnu    -> probable
 *   nom identique + pays different  -> REFUSE. C'est le cas dangereux : un
 *     homonyme dans un autre pays, qu'un enregistrement en « probable »
 *     transformerait en fait au bout de quelques semaines.
 */
async function chercherGleif(nom, pays) {
  const d = await json('https://api.gleif.org/api/v1/lei-records?page[size]=5'
    + '&filter[entity.legalName]=' + encodeURIComponent(nom));
  const candidats = (d && d.data) || [];
  const cible = normaliser(nom);
  for (const c of candidats) {
    const e = c.attributes.entity;
    if (normaliser(e.legalName && e.legalName.name ? e.legalName.name : e.legalName) !== cible) continue;
    const paysLegal = (e.legalAddress && e.legalAddress.country) || null;
    if (pays && paysLegal && paysLegal !== pays) continue;   // homonyme etranger
    return {
      lei: c.attributes.lei,
      pays: paysLegal,
      statut: c.attributes.registration && c.attributes.registration.status,
      nomLegal: e.legalName && e.legalName.name ? e.legalName.name : e.legalName,
      confiance: pays && paysLegal === pays ? 'certain' : 'probable',
    };
  }
  return null;
}

/* -------------------------------------------------------------- SEC EDGAR */

/*
 * Rapprochement EDGAR.
 *
 * La recherche par societe rend un flux Atom : une entree par deposant, avec
 * son nom normalise (« conformed name ») et son CIK. On n'accepte que l'entree
 * dont le nom normalise est le notre — un « Capital Partners » approchant ne
 * vaut rien.
 */
async function chercherEdgar(nom) {
  const u = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&output=atom&count=10'
    + '&company=' + encodeURIComponent(nom);
  let texte;
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA } });
    if (!r.ok) return null;
    texte = await r.text();
  } catch { return null; }

  const cible = normaliser(nom);
  // Deposant unique : EDGAR rend la fiche, pas une liste.
  const seul = /<conformed-name>([^<]+)<\/conformed-name>[\s\S]*?<CIK>(\d+)<\/CIK>/i.exec(texte);
  if (seul && normaliser(seul[1]) === cible) return { cik: seul[2], nom: seul[1] };

  // Liste : « CIK 0001593517 - SEQUOIA CAPITAL ... » dans le titre de chaque entree.
  for (const m of texte.matchAll(/<title>\s*CIK\s+(\d+)\s*-\s*([^<(]+)/gi)) {
    if (normaliser(m[2]) === cible) return { cik: m[1], nom: m[2].trim() };
  }
  return null;
}

/*
 * Quels formulaires ce deposant a-t-il deposes ? C'est la que se lit la nature
 * de l'entite : 13F-HR = gerant institutionnel au-dessus de 100 M$, D = levee
 * privee, ADV = conseil en investissement enregistre.
 */
const FORMULAIRES_PARLANTS = ['13F-HR', 'D', 'ADV', '10-K', 'S-1'];

async function formulairesEdgar(cik) {
  const d = await json(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`);
  const recents = d && d.filings && d.filings.recent && d.filings.recent.form;
  if (!recents) return null;
  const vus = FORMULAIRES_PARLANTS.filter(f => recents.includes(f));
  return vus.length ? vus.join(',') : null;
}

/* ---------------------------------------------------------------- passage */

const SQL_ORGANISATIONS = `
  SELECT o.ORG_KEY, o.NOM, o.PAYS
    FROM V_ORGANISATIONS o
   WHERE o.NOM IS NOT NULL
     AND EXISTS (SELECT 1 FROM V_PERSONNES p
                  WHERE p.ORG_KEY = o.ORG_KEY AND p.EMAIL IS NOT NULL)
   ORDER BY o.ORG_KEY`;

/*
 * On n'enrichit que les organisations derriere une adresse (583 le
 * 2026-09-01), pas les 74 663 de la base. Enrichir ce dont on ne se servira
 * pas coute du temps et vieillit aussi vite.
 */
async function enrichirOrganisations(q, { appliquer = false, limite = null,
                                          qLot = null, pause: attente = 350 } = {}) {
  const r = await q(SQL_ORGANISATIONS
    + (limite ? ` FETCH FIRST ${Number(limite)} ROWS ONLY` : ''));
  const orgs = r.rows;
  const lignes = [];
  const resume = { organisations: orgs.length, gleif: 0, gleif_certain: 0,
                   edgar: 0, edgar_formulaires: 0, pays: {}, statuts: {} };

  for (const o of orgs) {
    const g = await chercherGleif(o.NOM, o.PAYS);
    if (g) {
      resume.gleif++;
      if (g.confiance === 'certain') resume.gleif_certain++;
      resume.pays[g.pays || '??'] = (resume.pays[g.pays || '??'] || 0) + 1;
      resume.statuts[g.statut || '??'] = (resume.statuts[g.statut || '??'] || 0) + 1;
      lignes.push({ cible: o.ORG_KEY, champ: 'lei', valeur: g.lei,
                    confiance: g.confiance, source: 'gleif', detail: g.nomLegal });
      if (g.pays) lignes.push({ cible: o.ORG_KEY, champ: 'pays_legal', valeur: g.pays,
                    confiance: g.confiance, source: 'gleif', detail: g.lei });
      if (g.statut) lignes.push({ cible: o.ORG_KEY, champ: 'statut_lei', valeur: g.statut,
                    confiance: 'certain', source: 'gleif', detail: g.lei });
    }
    await pause(attente);

    const e = await chercherEdgar(o.NOM);
    if (e) {
      resume.edgar++;
      lignes.push({ cible: o.ORG_KEY, champ: 'sec_cik', valeur: e.cik,
                    confiance: 'probable', source: 'sec_edgar', detail: e.nom });
      const f = await formulairesEdgar(e.cik);
      if (f) {
        resume.edgar_formulaires++;
        lignes.push({ cible: o.ORG_KEY, champ: 'sec_formulaires', valeur: f,
                      confiance: 'certain', source: 'sec_edgar', detail: `CIK ${e.cik}` });
      }
      await pause(attente);
    }
    await pause(attente);
  }

  resume.valeurs = lignes.length;
  if (!appliquer) return { simulation: true, resume, lignes };
  await ecrireEnrichissements(qLot, 'organisation', lignes);
  return { simulation: false, resume };
}

module.exports = { enrichirOrganisations, normaliser, chercherGleif, chercherEdgar,
                   SQL_ORGANISATIONS };
