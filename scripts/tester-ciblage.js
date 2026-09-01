'use strict';
/*
 * Recette du CIBLAGE, sur l'application deployee.
 *
 * Pourquoi ce script existe. Deux pannes de suite, le 2026-09-01, sur la meme
 * regle : « qui part quand on choisit une source ». D'abord une liste de deux
 * personnes qui n'en ciblait qu'une, puis une liste de trois qui n'en ciblait
 * que deux. Les deux fois, la correction a ete verifiee sur le cas signale —
 * pas sur la regle. Le troisieme cas est donc tombe le lendemain du deuxieme.
 *
 * Ce script couvre les TROIS formes qu'une personne peut prendre dans le
 * referentiel, et c'est la seule facon de ne pas rejouer ce scenario :
 *
 *   1. un contact investisseur, connu du routeur sous sa propre cle ;
 *   2. la MEME adresse portee par une autre fiche (entree par le gate), que
 *      l'on rapproche par l'adresse et non par la cle ;
 *   3. une adresse que le routeur ne connait pas du tout, pour qui il doit
 *      ouvrir une ligne de demarchage.
 *
 * Il ne prepare ni n'envoie rien : il lit l'apercu, qui repond a la question
 * « combien partiraient ». Une liste temporaire est creee puis supprimee.
 *
 *   CG_ADMIN_MDP=... node scripts/tester-ciblage.js
 */
const BASE = process.env.CG_URL || 'https://arx-consulting.com/capgrowth';
const EMAIL = process.env.CG_ADMIN_EMAIL || 'benoit.p.g.sigwald@gmail.com';
const MDP = process.env.CG_ADMIN_MDP;
const MANDAT = Number(process.env.CG_MANDAT || 1);

// Les trois formes, sur le mandat de reference. A ajuster si la base change :
// le script dit clairement laquelle manque plutot que d'echouer sans raison.
const CAS = [
  { cle: 'inv:TEST-christophe-bazaille', forme: 'contact investisseur' },
  { cle: 'gate:50:5', forme: 'meme adresse, autre fiche' },
  { cle: 'gate:arxcapital:3', forme: 'adresse inconnue du routeur' },
];

let reussis = 0;
const echecs = [];
function verifier(nom, condition, detail) {
  if (condition) { reussis++; console.log(`  ok   ${nom}`); }
  else { echecs.push(`${nom} — ${detail}`); console.log(`  ECHEC ${nom} — ${detail}`); }
}

const bocal = new Map();
function retenir(r) {
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const [paire] = c.split(';'); const i = paire.indexOf('=');
    bocal.set(paire.slice(0, i), paire.slice(i + 1));
  }
}
async function appel(chemin, options = {}) {
  const r = await fetch(BASE + chemin, { ...options, redirect: 'manual',
    headers: { cookie: [...bocal].map(([k, v]) => `${k}=${v}`).join('; '),
               ...(options.headers || {}) } });
  retenir(r);
  return r;
}
const json = async (chemin, options) => (await appel(chemin, options)).json();

async function main() {
  if (!MDP) { console.error('CG_ADMIN_MDP manquant.'); process.exit(2); }
  console.log(`Surface : ${BASE}\nMandat  : ${MANDAT}\n`);

  const csrf = (await json('/api/auth/csrf')).csrfToken;
  await appel('/api/auth/callback/credentials', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf, email: EMAIL, motdepasse: MDP, json: 'true' }) });
  const s = await json('/api/auth/session');
  if (!s.user) { console.error('connexion refusee'); process.exit(2); }

  // Liste temporaire, nommee pour qu'on la reconnaisse si un plantage la laisse.
  const nom = 'RECETTE ciblage — a supprimer';
  await appel(`/api/listes?client=${MANDAT}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client: MANDAT, nom }) });
  const listes = (await json(`/api/listes?client=${MANDAT}`)).rows || [];
  const liste = listes.find(l => l.NOM === nom);
  if (!liste) { console.error('liste de recette non creee'); process.exit(2); }

  try {
    console.log('1. Chaque forme, seule');
    for (const cas of CAS) {
      await appel(`/api/listes/${liste.ID}`, { method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_keys: CAS.map(c => c.cle) }) });
      const ajout = await json(`/api/listes/${liste.ID}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_keys: [cas.cle] }) });
      if (!ajout.ajoutes) {
        verifier(cas.forme, false, `${cas.cle} absent du referentiel`);
        continue;
      }
      const a = await json(`/api/apercu?client=${MANDAT}&liste_id=${liste.ID}`);
      verifier(`${cas.forme} → 1 cible`, a.cibles === 1, `recu ${a.cibles}`);
    }

    console.log('\n2. Les trois ensemble');
    await appel(`/api/listes/${liste.ID}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_keys: CAS.map(c => c.cle) }) });
    const total = await json(`/api/apercu?client=${MANDAT}&liste_id=${liste.ID}`);
    // Le coeur du sujet : autant de cibles que de membres joignables. C'est
    // exactement ce qui a manque deux fois.
    verifier('3 membres → 3 cibles', total.cibles === CAS.length,
             `recu ${total.cibles} pour ${CAS.length} membres`);
    verifier('les nouveaux destinataires sont comptes', total.nouveaux >= 1,
             `recu ${total.nouveaux}`);

    console.log('\n3. Le segment ne perd personne');
    const segs = (await json(`/api/segments?client=${MANDAT}`)).rows || [];
    if (!segs.length) console.log('  (aucun segment sur ce mandat, controle saute)');
    else {
      const a = await json(`/api/apercu?client=${MANDAT}&segment_id=${segs[0].ID}&limite=50`);
      verifier(`segment « ${segs[0].NOM} » rend des cibles`, a.cibles > 0, `recu ${a.cibles}`);
    }
  } finally {
    await appel(`/api/listes/${liste.ID}`, { method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supprimer_liste: true }) });
    console.log('\nliste de recette supprimee.');
  }

  console.log(`${reussis} controle(s) passe(s), ${echecs.length} echec(s).`);
  if (echecs.length) { echecs.forEach(e => console.log('  - ' + e)); process.exit(1); }
}
main().catch(e => { console.error('ERREUR', e.message); process.exit(2); });
