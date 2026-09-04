'use strict';
/*
 * Les comptes GATE_ sont-ils encore ouverts ?
 *
 * Le 2026-09-02, GATE_877 s'est retrouve LOCKED(TIMED) : son mot de passe avait
 * derive de celui de la base, la porte a reessaye a chaque visite, et Oracle a
 * ferme le compte apres N echecs. Personne ne l'a su jusqu'a ce qu'un ecran
 * affiche « ORA-01017 » a la place du tracker — plusieurs jours plus tard.
 *
 * Un compte verrouille ne se repare pas tout seul et ne fait aucun bruit : il
 * rend une page d'erreur a des visiteurs, et c'est tout. D'ou ce controle.
 *
 * Il ALERTE, il ne repare pas. Deverrouiller sans corriger le mot de passe qui
 * derive rendrait le compte a la porte, qui le reverrouillerait dans l'heure —
 * en cachant le probleme un peu mieux a chaque fois.
 *
 *   node verifier-comptes-gate.js            etat, sans alerte
 *   node verifier-comptes-gate.js --alerter   previent par courriel si anomalie
 *
 * Se connecte en ADMIN : ACCOUNT_STATUS ne vit que dans DBA_USERS, aucun role
 * moindre ne le lit.
 */
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const ALERTER = process.argv.includes('--alerter');
/*
 * --essai : force une anomalie fictive pour eprouver le chemin d'alerte.
 *
 * Un canal d'alerte ne se verifie qu'en s'en servant. Le courriel par le
 * routeur en est le seul ; sans moyen de le declencher a la demande, on ne
 * saurait qu'il est casse le jour ou il aurait du parler. Le message dit qu'il
 * s'agit d'un essai — une alerte de test prise pour une vraie coute une matinee.
 */
const ESSAI = process.argv.includes('--essai');

/*
 * Les comptes de service, hors GATE_ : ceux sous lesquels les applications se
 * connectent a la base. Un GATE_ verrouille prive un site de son tracker ;
 * PROSPECTS verrouille prive capgrowth de TOUTE connexion — meme panne muette
 * que GATE_877, page ORA-01017 a la place de l'appli. INVESTORS porte le
 * routeur, donc aussi le canal d'alerte : s'il tombe, l'alerte se tait avec
 * lui, raison de plus pour le voir venir par l'expiration.
 */
const SERVICES = { PROSPECTS: 'capgrowth', INVESTORS: 'routeur / mailer' };

async function main() {
  const cn = await oracledb.getConnection({
    user: 'ADMIN', password: process.env.AP,
    connectString: process.env.ORA_CONNECT,
    configDir: process.env.ORA_WALLET_DIR || '/tmp/wallet',
    walletLocation: process.env.ORA_WALLET_DIR || '/tmp/wallet',
    walletPassword: process.env.ORA_WALLET_PASSWORD,
  });

  /*
   * SUBSTR plutot qu'un LIKE : le souligne est un joker SQL, et l'echapper
   * dans un script transporte par plusieurs couches de shell coute plus cher
   * que de s'en passer.
   *
   * On regarde aussi la date d'expiration : un mot de passe qui expire ferme
   * le compte tout aussi surement, avec quelques semaines de preavis que
   * personne ne lit.
   */
  const r = await cn.execute(
    `SELECT USERNAME, ACCOUNT_STATUS, EXPIRY_DATE,
            TRUNC(EXPIRY_DATE - SYSDATE) JOURS_AVANT_EXPIRATION
       FROM DBA_USERS
      WHERE SUBSTR(USERNAME, 1, 5) = 'GATE_'
         OR USERNAME IN (${Object.keys(SERVICES).map(u => `'${u}'`).join(', ')})
      ORDER BY USERNAME`);
  await cn.close();

  const comptes = r.rows;
  const fermes = comptes.filter(c => c.ACCOUNT_STATUS !== 'OPEN');
  const bientot = comptes.filter(c => c.ACCOUNT_STATUS === 'OPEN'
    && c.JOURS_AVANT_EXPIRATION !== null && c.JOURS_AVANT_EXPIRATION <= 21);

  const nbServices = comptes.filter(c => c.USERNAME in SERVICES).length;
  console.log(`${comptes.length} comptes surveilles `
            + `(${comptes.length - nbServices} GATE_ + ${nbServices} de service) : `
            + `${comptes.length - fermes.length} ouverts, ${fermes.length} hors service`);
  for (const c of fermes) console.log(`  FERME   ${c.USERNAME} — ${c.ACCOUNT_STATUS}`);
  for (const c of bientot) console.log(`  EXPIRE  ${c.USERNAME} — dans ${c.JOURS_AVANT_EXPIRATION} j`);

  if (ESSAI) {
    fermes.push({ USERNAME: 'GATE_ESSAI', ACCOUNT_STATUS: 'ESSAI — aucun compte reel en cause' });
    console.log('  (essai : anomalie fictive ajoutee pour eprouver le canal)');
  }
  if (!fermes.length && !bientot.length) return 0;
  if (!ALERTER) return fermes.length ? 1 : 0;

  const nom = c => SERVICES[c.USERNAME] ? `${c.USERNAME} (${SERVICES[c.USERNAME]})` : c.USERNAME;
  const lignes = [
    ...fermes.map(c => `${nom(c)} : ${c.ACCOUNT_STATUS}`),
    ...bientot.map(c => `${nom(c)} : expire dans ${c.JOURS_AVANT_EXPIRATION} j`),
  ];
  // Le message dit quoi faire : une alerte qui laisse chercher la cause fait
  // perdre le temps qu'elle etait censee gagner.
  const corps = lignes.join('\n')
    + '\n\nUn verrouillage vient presque toujours d un mot de passe qui a derive'
    + ' entre SITES_B64 (porte) et la base. Aligner la base sur la porte, PUIS'
    + ' deverrouiller — l inverse reverrouille dans l heure.';

  const sujet = ESSAI ? 'Essai du canal — comptes GATE_'
                      : `Comptes surveilles : ${lignes.length} anomalie(s)`;

  /*
   * Un seul canal : le courriel par le routeur.
   *
   * ntfy a ete retire le 2026-09-03 sur demande. Il etait sature en permanence
   * — quota quotidien du palier gratuit atteint par les notifications de la
   * porte — donc muet quand il aurait fallu qu'il parle. Garder un canal qui
   * refuse les messages fait croire qu'on surveille : c'est pire que de ne pas
   * en avoir, on cesse de regarder ailleurs.
   */
  let porte = false;
  if (process.env.MAILER_BASE && process.env.MAILER_SECRET) {
    try {
      const rep = await fetch(`${process.env.MAILER_BASE}/alerte`, {
        method: 'POST',
        headers: { 'content-type': 'application/json',
                   'x-mailer-secret': process.env.MAILER_SECRET },
        body: JSON.stringify({ sujet, corps }),
      });
      console.log('courriel :', rep.status);
      porte = rep.ok;
    } catch (e) { console.log('routeur injoignable :', String(e.message).slice(0, 80)); }
  }

  if (ESSAI) return porte ? 0 : 2;
  if (!porte) {
    console.error('ANOMALIE NON DELIVREE : aucun canal n a accepte le message.');
    return 2;
  }
  return fermes.length ? 1 : 0;
}

main().then(code => process.exit(code)).catch(e => {
  console.error(e.message);
  process.exit(3);
});
