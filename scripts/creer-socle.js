'use strict';
/*
 * Socle multi-mandat de CapGrowthAI. En ADMIN (les GRANT l'exigent), objets
 * crees chez PROSPECTS via CURRENT_SCHEMA. Rejouable : chaque objet n'est
 * cree que s'il manque.
 *
 *   sudo docker cp creer-socle.js <gate>:/app/
 *   sudo docker exec -w /app -e AP="$(sudo cat /root/.ora_admin)" \
 *     -e ADMIN_EMAIL=... -e ADMIN_HASH='<bcrypt>' <gate> node creer-socle.js --appliquer
 */
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
const APPLIQUER = process.argv.includes('--appliquer');

const TABLES = {
  CLIENT: `CREATE TABLE CLIENT (
    ID NUMBER GENERATED ALWAYS AS IDENTITY,
    NOM VARCHAR2(160) NOT NULL,
    -- Choisi par l'admin a la creation du mandat : adresses communes, ou
    -- chaque utilisateur envoie sous la sienne (tranche 2).
    MODE_EXPEDITEUR VARCHAR2(12) DEFAULT 'mandat' NOT NULL,
    CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_CLIENT PRIMARY KEY (ID),
    CONSTRAINT UQ_CLIENT_NOM UNIQUE (NOM),
    CONSTRAINT CK_CLIENT_MODE CHECK (MODE_EXPEDITEUR IN ('mandat','utilisateur')))`,
  UTILISATEUR: `CREATE TABLE UTILISATEUR (
    ID NUMBER GENERATED ALWAYS AS IDENTITY,
    EMAIL VARCHAR2(320) NOT NULL,
    NOM VARCHAR2(160),
    HASH VARCHAR2(100) NOT NULL,
    ROLE VARCHAR2(10) NOT NULL,
    ACTIF NUMBER(1) DEFAULT 1 NOT NULL,
    CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_UTILISATEUR PRIMARY KEY (ID),
    CONSTRAINT UQ_UTILISATEUR_EMAIL UNIQUE (EMAIL),
    CONSTRAINT CK_UTILISATEUR_ROLE CHECK (ROLE IN ('admin','membre','client')))`,
  AFFECTATION: `CREATE TABLE AFFECTATION (
    UTILISATEUR_ID NUMBER NOT NULL REFERENCES UTILISATEUR(ID) ON DELETE CASCADE,
    CLIENT_ID NUMBER NOT NULL REFERENCES CLIENT(ID) ON DELETE CASCADE,
    CONSTRAINT PK_AFFECTATION PRIMARY KEY (UTILISATEUR_ID, CLIENT_ID))`,
  CONTACT_LISTE: `CREATE TABLE CONTACT_LISTE (
    ID NUMBER GENERATED ALWAYS AS IDENTITY,
    CLIENT_ID NUMBER NOT NULL REFERENCES CLIENT(ID),
    NOM VARCHAR2(160) NOT NULL,
    NOTES VARCHAR2(1000),
    CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_CONTACT_LISTE PRIMARY KEY (ID),
    CONSTRAINT UQ_CONTACT_LISTE UNIQUE (CLIENT_ID, NOM))`,
  CONTACT_LISTE_MEMBRE: `CREATE TABLE CONTACT_LISTE_MEMBRE (
    LISTE_ID NUMBER NOT NULL REFERENCES CONTACT_LISTE(ID) ON DELETE CASCADE,
    PERSON_KEY VARCHAR2(620) NOT NULL,
    AJOUTE_LE TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_CL_MEMBRE PRIMARY KEY (LISTE_ID, PERSON_KEY))`,
  ATTRIBUT_LIBRE: `CREATE TABLE ATTRIBUT_LIBRE (
    ID NUMBER GENERATED ALWAYS AS IDENTITY,
    CLIENT_ID NUMBER NOT NULL REFERENCES CLIENT(ID),
    NOM VARCHAR2(60) NOT NULL,
    TYPE VARCHAR2(10) DEFAULT 'texte' NOT NULL,
    CONSTRAINT PK_ATTRIBUT PRIMARY KEY (ID),
    CONSTRAINT UQ_ATTRIBUT UNIQUE (CLIENT_ID, NOM),
    CONSTRAINT CK_ATTRIBUT_TYPE CHECK (TYPE IN ('texte','nombre','date')))`,
  ATTRIBUT_VALEUR: `CREATE TABLE ATTRIBUT_VALEUR (
    ATTRIBUT_ID NUMBER NOT NULL REFERENCES ATTRIBUT_LIBRE(ID) ON DELETE CASCADE,
    PERSON_KEY VARCHAR2(620) NOT NULL,
    VALEUR VARCHAR2(1000),
    MAJ_LE TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_ATTR_VALEUR PRIMARY KEY (ATTRIBUT_ID, PERSON_KEY))`,
};

async function main() {
  const cn = await oracledb.getConnection({
    user: 'ADMIN', password: process.env.AP,
    connectString: process.env.ORA_CONNECT,
    configDir: '/tmp/wallet', walletLocation: '/tmp/wallet',
    walletPassword: process.env.ORA_WALLET_PASSWORD,
  });
  const q = (sql, b = {}) => cn.execute(sql, b, { autoCommit: true });
  await q(`ALTER SESSION SET CURRENT_SCHEMA = PROSPECTS`);

  const existe = async n => (await q(
    `SELECT COUNT(*) N FROM ALL_TABLES WHERE OWNER='PROSPECTS' AND TABLE_NAME=:n`,
    { n })).rows[0].N > 0;
  const colExiste = async (t, c) => (await q(
    `SELECT COUNT(*) N FROM ALL_TAB_COLUMNS WHERE OWNER='PROSPECTS' AND TABLE_NAME=:t AND COLUMN_NAME=:c`,
    { t, c })).rows[0].N > 0;

  // L'ecriture a la source exige des droits que la lecture n'avait pas.
  const gates = (await q(`SELECT OWNER FROM ALL_TABLES
      WHERE TABLE_NAME='PROSPECTS' AND OWNER LIKE 'GATE\\_%' ESCAPE '\\' ORDER BY OWNER`))
    .rows.map(r => r.OWNER);
  const grants = [
    `GRANT UPDATE, INSERT, DELETE ON INVESTORS.CONTACTS TO PROSPECTS`,
    `GRANT DELETE ON INVESTORS.DEMARCHAGE TO PROSPECTS`,
    ...gates.map(g => `GRANT UPDATE, DELETE ON ${g}.PROSPECTS TO PROSPECTS`),
  ];

  const etapes = [];
  for (const [nom, ddl] of Object.entries(TABLES)) {
    if (!(await existe(nom))) etapes.push([`table ${nom}`, ddl]);
  }
  if (!(await colExiste('LISTE', 'CLIENT_ID'))) {
    etapes.push(['colonne LISTE.CLIENT_ID',
      `ALTER TABLE LISTE ADD (CLIENT_ID NUMBER REFERENCES CLIENT(ID))`]);
    // L'unicite du nom devient par mandat : deux mandats peuvent nommer leurs
    // segments pareil sans se voir.
    etapes.push(['unicite LISTE', `ALTER TABLE LISTE DROP CONSTRAINT UQ_LISTE_NOM`]);
    etapes.push(['unicite LISTE', `ALTER TABLE LISTE ADD CONSTRAINT UQ_LISTE_CLIENT_NOM UNIQUE (CLIENT_ID, NOM)`]);
  }
  etapes.push(...grants.map(g => ['grant', g]));

  if (!APPLIQUER) {
    etapes.forEach(([t, sql]) => console.log(`-- ${t}\n${sql};\n`));
    console.log('-- simulation. Relancer avec --appliquer.');
    await cn.close(); return;
  }
  for (const [t, sql] of etapes) { await q(sql); console.log(`  ok ${t}`); }

  // Amorcage : le premier mandat et le compte admin. Idempotent par MERGE.
  await q(`MERGE INTO CLIENT c USING (SELECT 'Innovat Property' NOM FROM DUAL) s
           ON (c.NOM = s.NOM)
           WHEN NOT MATCHED THEN INSERT (NOM, MODE_EXPEDITEUR) VALUES (s.NOM, 'mandat')`);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_HASH) {
    await q(`MERGE INTO UTILISATEUR u USING (SELECT :e EMAIL FROM DUAL) s
             ON (LOWER(u.EMAIL) = LOWER(s.EMAIL))
             WHEN MATCHED THEN UPDATE SET HASH = :h
             WHEN NOT MATCHED THEN INSERT (EMAIL, NOM, HASH, ROLE)
               VALUES (:e, 'Benoit', :h, 'admin')`,
          { e: process.env.ADMIN_EMAIL, h: process.env.ADMIN_HASH });
  }
  const v = await q(`SELECT (SELECT COUNT(*) FROM CLIENT) CLIENTS,
                            (SELECT COUNT(*) FROM UTILISATEUR) UTILISATEURS FROM DUAL`);
  console.log(`  verif : ${v.rows[0].CLIENTS} client(s), ${v.rows[0].UTILISATEURS} utilisateur(s)`);
  await cn.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
