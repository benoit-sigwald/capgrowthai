'use strict';
/*
 * Recette de la surface reelle : on interroge l'application deployee comme le
 * ferait un navigateur, avec un vrai compte, plutot que d'appeler des fonctions
 * en memoire. Les tests unitaires (npm test) verifient les regles ; celui-ci
 * verifie qu'elles arrivent jusqu'a l'URL — routage, session, cloisonnement.
 *
 * Le compte de recette n'est PAS administrateur, volontairement : c'est la
 * portee la plus facile a casser sans s'en apercevoir, puisque l'administrateur
 * traverse toutes les gardes.
 *
 *   CG_TEST_PASSWORD=... node scripts/tester-surface.js
 *
 * Variables : CG_URL (defaut : la production), CG_TEST_EMAIL, CG_TEST_PASSWORD,
 * CG_MANDAT (mandat affecte au compte), CG_MANDAT_INTERDIT (un autre mandat,
 * pour verifier le refus).
 */
const BASE = process.env.CG_URL || 'https://arx-consulting.com/capgrowth';
const EMAIL = process.env.CG_TEST_EMAIL || 'test-qa@arx.local';
const MDP = process.env.CG_TEST_PASSWORD;
/*
 * Les mandats ne sont PAS ecrits en dur.
 *
 * Le 2026-09-02, un droit accorde depuis l'ecran Parametres a fait echouer
 * quatre controles : la recette supposait que le compte n'avait qu'un mandat.
 * Une recette qui crie au loup quand on exerce une fonction normale finit
 * ignoree, et une recette ignoree ne protege plus rien. Elle lit donc la portee
 * dans la session et en deduit ce qu'elle doit verifier.
 */
let MIEN = Number(process.env.CG_MANDAT || 0);
let AUTRE = Number(process.env.CG_MANDAT_INTERDIT || 0);

let reussis = 0;
const echecs = [];
function verifier(nom, condition, detail) {
  if (condition) { reussis++; console.log(`  ok   ${nom}`); }
  else { echecs.push(`${nom} — ${detail}`); console.log(`  ECHEC ${nom} — ${detail}`); }
}

/* Bocal a cookies minimal : la session next-auth tient dans un en-tete. */
const bocal = new Map();
function retenir(reponse) {
  for (const c of reponse.headers.getSetCookie?.() ?? []) {
    const [paire] = c.split(';');
    const i = paire.indexOf('=');
    bocal.set(paire.slice(0, i), paire.slice(i + 1));
  }
}
function cookies() {
  return [...bocal].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function appel(chemin, options = {}) {
  const r = await fetch(BASE + chemin, {
    ...options, redirect: 'manual',
    headers: { cookie: cookies(), ...(options.headers || {}) },
  });
  retenir(r);
  return r;
}
async function connexion(email, motdepasse) {
  bocal.clear();
  const csrf = (await (await appel('/api/auth/csrf')).json()).csrfToken;
  await appel('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf, email, motdepasse, json: 'true' }),
  });
  return (await (await appel('/api/auth/session')).json());
}

/* Toutes les routes qui doivent exiger une session. */
const ROUTES = ['clients', 'utilisateurs', 'personnes', 'segments', 'campagnes',
  'expediteurs', 'pipeline', 'taches', 'journal', 'automatisations', 'statistiques',
  'modeles', 'gabarits', 'attributs', 'langues', 'listes', 'mes-mandats',
  'tableau-de-bord', 'chauffage', 'import', 'transactionnel', 'desinscrits',
  'reponses', 'redaction', 'apercu', 'rafraichir'];

async function main() {
  if (!MDP) { console.error('CG_TEST_PASSWORD manquant.'); process.exit(2); }
  console.log(`Surface : ${BASE}\nCompte  : ${EMAIL} (non administrateur)\n`);

  console.log('1. Sans session, tout est ferme');
  for (const route of ROUTES) {
    const r = await appel(`/api/${route}`);
    verifier(`GET /api/${route} refuse`, r.status === 401, `recu ${r.status}`);
  }
  for (const m of ['POST', 'PATCH', 'DELETE']) {
    const r = await appel('/api/clients', { method: m,
      headers: { 'Content-Type': 'application/json' }, body: '{"id":1}' });
    verifier(`${m} /api/clients refuse`, r.status === 401, `recu ${r.status}`);
  }
  const sante = await appel('/api/sante');
  verifier('/api/sante repond sans session', sante.status === 200, `recu ${sante.status}`);
  bocal.clear();

  console.log('\n2. Mauvais mot de passe');
  const refus = await connexion(EMAIL, 'ce-mot-de-passe-est-faux');
  verifier('aucune session ouverte', !refus.user, JSON.stringify(refus));

  console.log('\n3. Connexion et portee');
  const s = await connexion(EMAIL, MDP);
  verifier('session ouverte', s.user?.email === EMAIL, JSON.stringify(s));
  verifier('role non administrateur', s.portee?.role !== 'admin', String(s.portee?.role));
  const siens = s.portee?.clientIds || [];
  verifier('au moins un mandat dans la portee', siens.length > 0, JSON.stringify(siens));
  if (!MIEN) MIEN = siens[0];
  // Un identifiant qu'il n'a PAS : c'est lui qui doit etre refuse.
  if (!AUTRE) { AUTRE = 1; while (siens.includes(AUTRE)) AUTRE++; }
  console.log(`  (mandat affecte : ${MIEN} · mandat hors portee : ${AUTRE})`);
  verifier(`mandat ${AUTRE} hors portee`, !siens.includes(AUTRE), JSON.stringify(siens));
  verifier(`droit connu sur le mandat ${MIEN}`,
           ['membre', 'client'].includes((s.portee?.droits || {})[MIEN]),
           JSON.stringify(s.portee?.droits));

  console.log('\n4. Ce que ce compte doit atteindre');
  for (const [nom, chemin] of [
    ['selecteur de mandat', '/api/mes-mandats'],
    ['referentiel', '/api/personnes?canal=joignable'],
    ['langues', '/api/langues'],
    ['gabarits', '/api/gabarits'],
    [`segments du mandat ${MIEN}`, `/api/segments?client=${MIEN}`],
    [`campagnes du mandat ${MIEN}`, `/api/campagnes?client=${MIEN}`],
    [`listes du mandat ${MIEN}`, `/api/listes?client=${MIEN}`],
    [`pipeline du mandat ${MIEN}`, `/api/pipeline?client=${MIEN}`],
  ]) {
    const r = await appel(chemin);
    verifier(nom, r.status === 200, `recu ${r.status}`);
  }
  const mm = await (await appel('/api/mes-mandats')).json();
  const rendus = (mm.mandats || []).map(m => m.ID).sort();
  verifier('le selecteur ne rend QUE les mandats affectes',
           rendus.length === siens.length && rendus.every(id => siens.includes(id)),
           `rendus ${JSON.stringify(rendus)} pour ${JSON.stringify(siens)}`);

  console.log('\n5. Ce qui doit lui etre refuse');
  for (const [nom, chemin] of [
    ['administration des mandats', '/api/clients'],
    ['administration des comptes', '/api/utilisateurs'],
    [`segments du mandat ${AUTRE}`, `/api/segments?client=${AUTRE}`],
    [`campagnes du mandat ${AUTRE}`, `/api/campagnes?client=${AUTRE}`],
    [`listes du mandat ${AUTRE}`, `/api/listes?client=${AUTRE}`],
    [`pipeline du mandat ${AUTRE}`, `/api/pipeline?client=${AUTRE}`],
    ['segments sans mandat', '/api/segments'],
  ]) {
    const r = await appel(chemin);
    verifier(nom + ' refuse', r.status === 403, `recu ${r.status}`);
  }
  for (const m of ['POST', 'PATCH', 'DELETE']) {
    const r = await appel('/api/clients', { method: m,
      headers: { 'Content-Type': 'application/json' }, body: '{"id":1,"nom":"pirate"}' });
    verifier(`${m} /api/clients refuse`, r.status === 403, `recu ${r.status}`);
  }
  const cree = await appel('/api/utilisateurs', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'pirate@arx.local', role: 'admin' }) });
  verifier('creation de compte refusee', cree.status === 403, `recu ${cree.status}`);

  console.log(`\n${reussis} controle(s) passe(s), ${echecs.length} echec(s).`);
  if (echecs.length) { echecs.forEach(e => console.log('  - ' + e)); process.exit(1); }
}
main().catch(e => { console.error('ERREUR', e.message); process.exit(2); });
