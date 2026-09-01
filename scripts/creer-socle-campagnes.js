'use strict';
/*
 * Socle campagnes de la tranche 2. En ADMIN, objets chez PROSPECTS via
 * CURRENT_SCHEMA, colonnes ajoutees chez INVESTORS. Rejouable.
 *
 *   sudo docker exec -w /app -e AP="$(sudo cat /root/.ora_admin)" <gate> \
 *     node creer-socle-campagnes.js --appliquer
 */
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
const APPLIQUER = process.argv.includes('--appliquer');

const DDL_EXPEDITEUR = `CREATE TABLE EXPEDITEUR (
  ID NUMBER GENERATED ALWAYS AS IDENTITY,
  CLIENT_ID NUMBER NOT NULL REFERENCES CLIENT(ID),
  -- Rempli quand le mandat est en mode « expediteur par utilisateur » :
  -- l'adresse appartient alors a quelqu'un, pas au mandat.
  UTILISATEUR_ID NUMBER REFERENCES UTILISATEUR(ID),
  EMAIL VARCHAR2(320) NOT NULL,
  NOM_AFFICHAGE VARCHAR2(160),
  -- La partie apres l'arobase, en minuscules : c'est la cle du chauffage —
  -- la reputation se construit par domaine, pas par adresse.
  DOMAINE VARCHAR2(255) NOT NULL,
  BREVO_ID NUMBER,
  SPF_OK NUMBER(1) DEFAULT 0 NOT NULL,
  DKIM_OK NUMBER(1) DEFAULT 0 NOT NULL,
  VERIFIE_LE TIMESTAMP,
  CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT PK_EXPEDITEUR PRIMARY KEY (ID),
  CONSTRAINT UQ_EXPEDITEUR UNIQUE (CLIENT_ID, EMAIL))`;

async function main() {
  const cn = await oracledb.getConnection({
    user: 'ADMIN', password: process.env.AP,
    connectString: process.env.ORA_CONNECT,
    configDir: '/tmp/wallet', walletLocation: '/tmp/wallet',
    walletPassword: process.env.ORA_WALLET_PASSWORD,
  });
  const q = (sql, b = {}) => cn.execute(sql, b, { autoCommit: true });
  await q(`ALTER SESSION SET CURRENT_SCHEMA = PROSPECTS`);

  const tableExiste = async (o, t) => (await q(
    `SELECT COUNT(*) N FROM ALL_TABLES WHERE OWNER=:o AND TABLE_NAME=:t`, { o, t })).rows[0].N > 0;
  const colExiste = async (o, t, c) => (await q(
    `SELECT COUNT(*) N FROM ALL_TAB_COLUMNS WHERE OWNER=:o AND TABLE_NAME=:t AND COLUMN_NAME=:c`,
    { o, t, c })).rows[0].N > 0;

  const etapes = [];
  if (!(await tableExiste('PROSPECTS', 'EXPEDITEUR'))) etapes.push(['table EXPEDITEUR', DDL_EXPEDITEUR]);
  if (!(await colExiste('INVESTORS', 'MAILING_CAMPAIGNS', 'CLIENT_ID')))
    etapes.push(['colonnes MAILING_CAMPAIGNS',
      `ALTER TABLE INVESTORS.MAILING_CAMPAIGNS ADD (CLIENT_ID NUMBER, EXPEDITEUR_EMAIL VARCHAR2(320))`]);
  if (!(await colExiste('INVESTORS', 'MAILING_SENDS', 'EXPEDITEUR_EMAIL')))
    etapes.push(['colonne MAILING_SENDS',
      `ALTER TABLE INVESTORS.MAILING_SENDS ADD (EXPEDITEUR_EMAIL VARCHAR2(320))`]);
  if (!(await colExiste('PROSPECTS', 'CAMPAGNE', 'CLIENT_ID')))
    etapes.push(['colonne CAMPAGNE', `ALTER TABLE CAMPAGNE ADD (CLIENT_ID NUMBER)`]);
  etapes.push(['grant', `GRANT SELECT ON INVESTORS.MAILING_TEMPLATES TO PROSPECTS`]);

  if (!APPLIQUER) {
    etapes.forEach(([t, s]) => console.log(`-- ${t}\n${s};\n`));
    console.log('-- simulation. Relancer avec --appliquer.');
    await cn.close(); return;
  }
  for (const [t, sql] of etapes) { await q(sql); console.log(`  ok ${t}`); }

  // Amorcage : l'expediteur historique d'Innovat. Drapeaux a 0 — c'est la
  // verification DNS qui les monte, pas une declaration.
  await q(`MERGE INTO EXPEDITEUR e
           USING (SELECT c.ID CID FROM CLIENT c WHERE c.NOM = 'Innovat Property') s
             ON (e.CLIENT_ID = s.CID AND e.EMAIL = :em)
           WHEN NOT MATCHED THEN INSERT (CLIENT_ID, EMAIL, NOM_AFFICHAGE, DOMAINE)
             VALUES (s.CID, :em, 'Christophe Bazaille', 'innovatproperty.ch')`,
        { em: 'christophe.bazaille@innovatproperty.ch' });

  const v = await q(`SELECT ID, CLIENT_ID, EMAIL, DOMAINE, SPF_OK, DKIM_OK FROM EXPEDITEUR`);
  console.log('  verif :', JSON.stringify(v.rows));
  await cn.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
