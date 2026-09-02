'use strict';
/*
 * De quoi signer un message.
 *
 * L'expediteur ne portait que son adresse et un nom affiche. Une reponse
 * professionnelle se termine par un bloc que le destinataire peut utiliser :
 * qui ecrit, pour quelle maison, ou elle se trouve, comment la joindre. Ces
 * champs n'existaient nulle part — ni sur le contact, ni sur le mandat.
 *
 * Ils vivent sur l'EXPEDITEUR, pas sur le mandat : deux collaborateurs d'une
 * meme maison partagent l'adresse postale mais pas le telephone direct.
 *
 * Rien n'est obligatoire : une signature se construit avec ce qui est rempli,
 * et une ligne vide ne doit jamais devenir une ligne vide dans un e-mail.
 *
 *   sudo docker exec -w /app -e AP="$(sudo cat /root/.ora_admin)" <conteneur> \
 *     node creer-socle-signature.js --appliquer
 */
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
const APPLIQUER = process.argv.includes('--appliquer');

const COLONNES = [
  ['PRENOM', 'VARCHAR2(80)'],
  ['NOM', 'VARCHAR2(80)'],
  ['FONCTION', 'VARCHAR2(120)'],
  ['SOCIETE', 'VARCHAR2(160)'],
  ['ADRESSE', 'VARCHAR2(300)'],
  ['TELEPHONE', 'VARCHAR2(40)'],
  ['SITE', 'VARCHAR2(200)'],
];

async function main() {
  const cn = await oracledb.getConnection({
    user: 'ADMIN', password: process.env.AP,
    connectString: process.env.ORA_CONNECT,
    configDir: '/tmp/wallet', walletLocation: '/tmp/wallet',
    walletPassword: process.env.ORA_WALLET_PASSWORD,
  });
  const q = (sql, b = {}) => cn.execute(sql, b, { autoCommit: true });
  await q(`ALTER SESSION SET CURRENT_SCHEMA = PROSPECTS`);

  const presentes = (await q(
    `SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS
      WHERE OWNER = 'PROSPECTS' AND TABLE_NAME = 'EXPEDITEUR'`)).rows.map(r => r.COLUMN_NAME);
  const manquantes = COLONNES.filter(([c]) => !presentes.includes(c));

  if (!manquantes.length) { console.log('  colonnes deja presentes'); await cn.close(); return; }
  const sql = `ALTER TABLE EXPEDITEUR ADD (${manquantes.map(([c, t]) => `${c} ${t}`).join(', ')})`;
  if (!APPLIQUER) { console.log(sql + ';\n-- simulation.'); await cn.close(); return; }

  await q(sql);
  console.log('  ok colonnes :', manquantes.map(([c]) => c).join(', '));

  /*
   * Reprise : NOM_AFFICHAGE contient deja « Prenom Nom » pour les expediteurs
   * existants. On le decoupe plutot que de laisser l'utilisateur ressaisir ce
   * qu'on sait deja — le premier mot au prenom, le reste au nom.
   */
  await q(`UPDATE EXPEDITEUR
              SET PRENOM = NVL(PRENOM, REGEXP_SUBSTR(NOM_AFFICHAGE, '^\\S+')),
                  NOM = NVL(NOM, TRIM(REGEXP_REPLACE(NOM_AFFICHAGE, '^\\S+', '')))
            WHERE NOM_AFFICHAGE IS NOT NULL`);
  const v = await q(`SELECT EMAIL, PRENOM, NOM, SOCIETE, TELEPHONE FROM EXPEDITEUR`);
  console.log('  expediteurs :', JSON.stringify(v.rows));
  await cn.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
