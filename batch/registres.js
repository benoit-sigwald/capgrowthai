'use strict';
/*
 * Enrichissement par les fichiers COMPLETS des registres publics.
 *
 * Pourquoi pas l'API. Mesure du 2026-09-01 : interroger GLEIF et EDGAR societe
 * par societe coute 6,6 s par societe — 65 minutes pour les 583 organisations
 * qui portent une adresse, et une eternite pour les 74 663 de la base. Les deux
 * registres publient leur base entiere en telechargement libre : un fichier une
 * fois par jour remplace des dizaines de milliers de requetes, et le cout cesse
 * de dependre du nombre de societes.
 *
 * Le rapprochement y gagne aussi en justesse. Le filtre par nom de l'API rend
 * « une entite qui ressemble » ; sur le fichier complet on voit combien de
 * candidats portent exactement ce nom — un seul, ou dix homonymes. Dans le
 * second cas on ne conclut pas.
 *
 * Deux phases, parce que le conteneur n'a ni « unzip » ni la place de tenir
 * 3,4 millions de lignes en memoire :
 *
 *   1. --exporter : ce conteneur ecrit la liste de NOS noms normalises.
 *   2. deploy/registres.py (sur l'hote) filtre les fichiers geants contre cette
 *      liste et ne rend que les lignes retenues.
 *   3. --importer : ce conteneur relit ces lignes et ecrit ENRICHISSEMENT.
 */
const fs = require('fs');
const path = require('path');
const { q, qLot, fermer } = require('./oracle');
const { ecrireEnrichissements } = require('./enrichir');
const { normaliser } = require('./enrichir-organisations');

const DOSSIER = process.env.REGISTRES_DIR || '/registres';
const APPLIQUER = process.argv.includes('--appliquer');

/* ---------------------------------------------------------------- export */

/*
 * Toutes les organisations, pas seulement celles qui portent une adresse : sur
 * un fichier local, la 74 663e coute autant que la premiere, c'est-a-dire rien.
 */
async function exporter() {
  const r = await q(`SELECT ORG_KEY, NOM, PAYS FROM V_ORGANISATIONS
                      WHERE NOM IS NOT NULL ORDER BY ORG_KEY`);
  const lignes = [];
  let vides = 0;
  for (const o of r.rows) {
    const n = normaliser(o.NOM);
    // Un nom qui se normalise a moins de trois caracteres ne discrimine rien :
    // le rapprocher rendrait n'importe quoi.
    if (n.length < 3) { vides++; continue; }
    lignes.push([n, o.ORG_KEY, o.PAYS || ''].join('\t'));
  }
  fs.mkdirSync(DOSSIER, { recursive: true });
  fs.writeFileSync(path.join(DOSSIER, 'noms.tsv'), lignes.join('\n') + '\n');
  console.log(`exporte : ${lignes.length} noms normalises` +
              (vides ? ` (${vides} ecartes, trop courts)` : ''));
  return lignes.length;
}

/* --------------------------------------------------------------- import */

function lireJsonl(fichier) {
  const p = path.join(DOSSIER, fichier);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

/*
 * Un nom qui designe plusieurs entites ne designe personne.
 *
 * « Alpha Capital » existe en France, au Luxembourg et au Delaware. Le filtre
 * de l'hote rend TOUS les candidats ; c'est ici qu'on tranche, et qu'on refuse
 * quand on ne peut pas.
 */
function choisir(candidats, pays) {
  if (candidats.length === 1) {
    return { ...candidats[0], confiance: pays && candidats[0].pays === pays ? 'certain' : 'probable' };
  }
  // Plusieurs candidats : seul le pays peut departager, et seulement s'il n'en
  // designe qu'un.
  const memePays = pays ? candidats.filter(c => c.pays === pays) : [];
  if (memePays.length === 1) return { ...memePays[0], confiance: 'certain' };
  return null;
}

async function importer() {
  const gleif = lireJsonl('gleif-retenus.jsonl');
  const edgar = lireJsonl('edgar-retenus.jsonl');
  console.log(`lus : ${gleif.length} lignes GLEIF, ${edgar.length} lignes EDGAR`);

  // Nos organisations, indexees par nom normalise.
  const noms = fs.readFileSync(path.join(DOSSIER, 'noms.tsv'), 'utf8')
    .split('\n').filter(Boolean).map(l => l.split('\t'));
  const parNom = new Map();
  for (const [n, cle, pays] of noms) {
    if (!parNom.has(n)) parNom.set(n, []);
    parNom.get(n).push({ cle, pays });
  }

  /*
   * On regroupe sur NOTRE normalisation du nom brut, jamais sur une cle
   * calculee par l'hote : le filtre python est un tamis large, le juge est
   * ici. Une divergence entre les deux fait rater un rapprochement, elle n'en
   * invente jamais un faux.
   */
  const grouper = (liste, champNom) => {
    const m = new Map();
    for (const c of liste) {
      const n = normaliser(c[champNom]);
      if (!m.has(n)) m.set(n, []);
      m.get(n).push(c);
    }
    return m;
  };
  const gParNom = grouper(gleif, 'nom_legal');
  const eParNom = grouper(edgar, 'nom_depose');

  const lignes = [];
  const resume = { organisations: 0, gleif: 0, gleif_certain: 0, ambigus: 0,
                   edgar: 0, pays: {}, statuts: {} };

  for (const [n, notres] of parNom) {
    for (const nous of notres) {
      resume.organisations++;
      const cg = gParNom.get(n);
      if (cg && cg.length) {
        const choix = choisir(cg, nous.pays);
        if (!choix) resume.ambigus++;
        else {
          resume.gleif++;
          if (choix.confiance === 'certain') resume.gleif_certain++;
          resume.pays[choix.pays || '??'] = (resume.pays[choix.pays || '??'] || 0) + 1;
          resume.statuts[choix.statut || '??'] = (resume.statuts[choix.statut || '??'] || 0) + 1;
          lignes.push({ cible: nous.cle, champ: 'lei', valeur: choix.lei,
                        confiance: choix.confiance, source: 'gleif', detail: choix.nom_legal });
          if (choix.pays) lignes.push({ cible: nous.cle, champ: 'pays_legal', valeur: choix.pays,
                        confiance: choix.confiance, source: 'gleif', detail: choix.lei });
          if (choix.statut) lignes.push({ cible: nous.cle, champ: 'statut_lei', valeur: choix.statut,
                        confiance: 'certain', source: 'gleif', detail: choix.lei });
          if (choix.forme) lignes.push({ cible: nous.cle, champ: 'forme_juridique', valeur: choix.forme,
                        confiance: choix.confiance, source: 'gleif', detail: choix.lei });
          if (choix.categorie) lignes.push({ cible: nous.cle, champ: 'categorie_entite',
                        valeur: choix.categorie, confiance: choix.confiance,
                        source: 'gleif', detail: choix.juridiction || choix.lei });
        }
      }
      const ce = eParNom.get(n);
      // EDGAR ne porte pas de pays : un homonyme ne se departage pas, on ne
      // retient donc que les noms qui ne designent qu'un seul deposant.
      if (ce && ce.length === 1) {
        resume.edgar++;
        lignes.push({ cible: nous.cle, champ: 'sec_cik', valeur: ce[0].cik,
                      confiance: 'probable', source: 'sec_edgar', detail: ce[0].nom_depose });
      }
    }
  }

  resume.valeurs = lignes.length;
  if (!APPLIQUER) return { simulation: true, resume };
  await ecrireEnrichissements(qLot, 'organisation', lignes);
  return { simulation: false, resume };
}

async function main() {
  if (process.argv.includes('--exporter')) { await exporter(); await fermer(); return; }
  if (process.argv.includes('--importer')) {
    const t0 = Date.now();
    const r = await importer();
    const s = r.resume;
    console.log(`\nOrganisations : ${s.organisations} confrontees, ` +
                `${Math.round((Date.now() - t0) / 1000)} s`);
    console.log(`  GLEIF  : ${s.gleif} rapprochees (dont ${s.gleif_certain} pays concordant), ` +
                `${s.ambigus} homonymes refuses`);
    console.log(`  EDGAR  : ${s.edgar} deposants uniques`);
    console.log(`  valeurs: ${s.valeurs}${r.simulation ? '  (simulation : rien ecrit)' : ''}`);
    for (const [k, n] of Object.entries(s.pays).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`    pays ${String(k).padEnd(6)} ${String(n).padStart(5)}`);
    }
    await fermer(); return;
  }
  console.log('usage : node registres.js --exporter | --importer [--appliquer]');
  await fermer();
}

if (require.main === module) main().catch(async e => {
  console.error(e.message); await fermer().catch(() => {}); process.exit(1);
});

module.exports = { exporter, importer, choisir };
