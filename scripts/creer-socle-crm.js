'use strict';
/*
 * Socle CRM de la tranche 3 : l'etat commercial devient PAR MANDAT.
 *
 *   sudo docker exec -w /app -e AP="$(sudo cat /root/.ora_admin)" <gate> \
 *     node creer-socle-crm.js --appliquer
 *
 * Pourquoi changer la cle primaire : le meme investisseur peut etre « gagne »
 * sur un mandat et « a contacter » sur un autre. Une seule ligne par personne
 * forcerait les mandats a se marcher dessus.
 *
 * Ce qui ne devient PAS par mandat : l'opposition. Un refus porte sur la
 * personne, pas sur le projet qu'on lui presentait ; elle reste lue dans
 * V_PERSONNES.OPT_OUT, qui la tire de DEMARCHAGE et de CONTACTS.OPPOSITION.
 *
 * Les 3 lignes existantes viennent des essais du mailer Innovat : elles vont
 * au mandat 1. Ce n'est pas une supposition, c'est leur provenance.
 */
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
const APPLIQUER = process.argv.includes('--appliquer');

async function main() {
  const cn = await oracledb.getConnection({
    user: 'ADMIN', password: process.env.AP,
    connectString: process.env.ORA_CONNECT,
    configDir: '/tmp/wallet', walletLocation: '/tmp/wallet',
    walletPassword: process.env.ORA_WALLET_PASSWORD,
  });
  const q = (sql, b = {}) => cn.execute(sql, b, { autoCommit: true });
  await q(`ALTER SESSION SET CURRENT_SCHEMA = PROSPECTS`);

  const col = async (t, c) => (await q(
    `SELECT COUNT(*) N FROM ALL_TAB_COLUMNS WHERE OWNER='PROSPECTS' AND TABLE_NAME=:t AND COLUMN_NAME=:c`,
    { t, c })).rows[0].N > 0;
  const contrainte = async n => (await q(
    `SELECT COUNT(*) N FROM ALL_CONSTRAINTS WHERE OWNER='PROSPECTS' AND CONSTRAINT_NAME=:n`,
    { n })).rows[0].N > 0;

  const etapes = [];
  if (!(await col('CONTACT_STATE', 'CLIENT_ID'))) {
    etapes.push(['colonne', `ALTER TABLE CONTACT_STATE ADD (CLIENT_ID NUMBER)`]);
    etapes.push(['reprise', `UPDATE CONTACT_STATE SET CLIENT_ID = (SELECT MIN(ID) FROM CLIENT) WHERE CLIENT_ID IS NULL`]);
    etapes.push(['obligatoire', `ALTER TABLE CONTACT_STATE MODIFY (CLIENT_ID NOT NULL)`]);
    // La cle primaire devient composite. DROP puis ADD : Oracle ne sait pas
    // elargir une PK en place.
    etapes.push(['pk', `ALTER TABLE CONTACT_STATE DROP CONSTRAINT PK_CONTACT_STATE DROP INDEX`]);
    etapes.push(['pk', `ALTER TABLE CONTACT_STATE ADD CONSTRAINT PK_CONTACT_STATE PRIMARY KEY (CLIENT_ID, PERSON_KEY)`]);
    etapes.push(['fk', `ALTER TABLE CONTACT_STATE ADD CONSTRAINT FK_CS_CLIENT FOREIGN KEY (CLIENT_ID) REFERENCES CLIENT(ID)`]);
  }
  // La frise reste commune (un envoi est un fait), mais porte son mandat quand
  // il est connu : c'est ce qui permet de filtrer la frise par mandat.
  if (!(await col('INTERACTION', 'CLIENT_ID')))
    etapes.push(['colonne', `ALTER TABLE INTERACTION ADD (CLIENT_ID NUMBER)`]);
  if (!(await contrainte('IX_CS_CLIENT')))
    etapes.push(['index', `CREATE INDEX IX_CS_CLIENT ON CONTACT_STATE (CLIENT_ID, STATUT)`]);

  if (!APPLIQUER) {
    etapes.forEach(([t, s]) => console.log(`-- ${t}\n${s};\n`));
    console.log('-- simulation. Relancer avec --appliquer.');
    await cn.close(); return;
  }
  for (const [t, sql] of etapes) {
    try { await q(sql); console.log(`  ok ${t} : ${sql.slice(0, 70)}`); }
    catch (e) {
      // Un index deja present n'est pas un echec de migration.
      if (/ORA-00955|ORA-01430|ORA-02275/.test(e.message)) console.log(`  deja fait : ${e.message.slice(0, 50)}`);
      else throw e;
    }
  }

  const v = await q(`SELECT CLIENT_ID, STATUT, COUNT(*) N FROM CONTACT_STATE
                     GROUP BY CLIENT_ID, STATUT ORDER BY CLIENT_ID`);
  console.log('  CONTACT_STATE :', JSON.stringify(v.rows));
  await cn.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
