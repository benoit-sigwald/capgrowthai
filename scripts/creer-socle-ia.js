'use strict';
/*
 * Reglages de redaction assistee, PAR MANDAT.
 *
 * Le ton d'une reponse n'est pas une preference personnelle : c'est la voix du
 * mandat. Deux personnes qui repondent aux memes investisseurs doivent ecrire
 * de la meme facon. Ranger cela dans le navigateur de chacun aurait garanti
 * l'inverse.
 *
 * Une ligne par mandat, creee a la volee au premier enregistrement.
 *
 *   sudo docker exec -w /app -e AP="$(sudo cat /root/.ora_admin)" <conteneur> \
 *     node creer-socle-ia.js --appliquer
 */
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
const APPLIQUER = process.argv.includes('--appliquer');

const DDL = `CREATE TABLE PROSPECTS.REGLAGE_IA (
  CLIENT_ID  NUMBER NOT NULL,
  -- « formel » vouvoie et garde ses distances, « cordial » reste professionnel
  -- mais chaleureux, « direct » va au fait sans secheresse.
  TON        VARCHAR2(12) DEFAULT 'formel' NOT NULL,
  LONGUEUR   VARCHAR2(12) DEFAULT 'bref' NOT NULL,
  -- Formule d'appel et de conge imposees, quand la maison en a.
  APPEL      VARCHAR2(120),
  CONGE      VARCHAR2(160),
  SIGNATURE  VARCHAR2(200),
  LANGUE     VARCHAR2(8) DEFAULT 'auto' NOT NULL,
  -- Ce que le modele doit savoir du mandat : activite, ce qu'on propose, ce
  -- qu'on ne promet jamais. C'est ce qui separe une reponse juste d'une
  -- reponse plausible.
  CONTEXTE   VARCHAR2(2000),
  UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT PK_REGLAGE_IA PRIMARY KEY (CLIENT_ID),
  CONSTRAINT FK_REGLAGE_IA_CLIENT FOREIGN KEY (CLIENT_ID) REFERENCES PROSPECTS.CLIENT(ID),
  CONSTRAINT CK_REGLAGE_TON CHECK (TON IN ('formel', 'cordial', 'direct')),
  CONSTRAINT CK_REGLAGE_LONG CHECK (LONGUEUR IN ('bref', 'standard', 'detaille'))
)`;

async function main() {
  const cn = await oracledb.getConnection({
    user: 'ADMIN', password: process.env.AP,
    connectString: process.env.ORA_CONNECT,
    configDir: '/tmp/wallet', walletLocation: '/tmp/wallet',
    walletPassword: process.env.ORA_WALLET_PASSWORD,
  });
  const q = (sql, b = {}) => cn.execute(sql, b, { autoCommit: true });
  await q(`ALTER SESSION SET CURRENT_SCHEMA = PROSPECTS`);

  const existe = (await q(
    `SELECT COUNT(*) N FROM ALL_TABLES WHERE OWNER = 'PROSPECTS' AND TABLE_NAME = 'REGLAGE_IA'`
  )).rows[0].N > 0;

  if (existe) { console.log('  table REGLAGE_IA deja presente'); await cn.close(); return; }
  if (!APPLIQUER) { console.log(DDL + ';\n-- simulation.'); await cn.close(); return; }

  await q(DDL);
  console.log('  ok table : PROSPECTS.REGLAGE_IA');
  await q(`GRANT SELECT, INSERT, UPDATE, DELETE ON PROSPECTS.REGLAGE_IA TO PROSPECTS`)
    .catch(() => {});   // proprietaire de son propre schema : deja permis
  const v = await q(`SELECT COUNT(*) N FROM REGLAGE_IA`);
  console.log('  lignes :', v.rows[0].N);
  await cn.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
