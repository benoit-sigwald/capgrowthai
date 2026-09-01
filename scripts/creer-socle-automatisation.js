'use strict';
/*
 * Socle de la tranche 5 : automatisations, et gabarits par mandat.
 *
 *   sudo docker exec -w /app -e AP="$(sudo cat /root/.ora_admin)" <gate> \
 *     node creer-socle-automatisation.js --appliquer
 */
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
const APPLIQUER = process.argv.includes('--appliquer');

const DECLENCHEURS = ['reponse', 'clic', 'sans_reponse', 'inscription', 'rebond'];
const ACTIONS = ['tache', 'statut', 'notifier'];

const DDL_AUTOMATISATION = `CREATE TABLE AUTOMATISATION (
  ID NUMBER GENERATED ALWAYS AS IDENTITY,
  CLIENT_ID NUMBER NOT NULL REFERENCES CLIENT(ID),
  NOM VARCHAR2(160) NOT NULL,
  ACTIF NUMBER(1) DEFAULT 1 NOT NULL,
  DECLENCHEUR VARCHAR2(20) NOT NULL,
  -- Delai en jours, pour le seul declencheur qui en a besoin : « sans reponse
  -- depuis N jours ». Ailleurs il est ignore.
  DELAI_JOURS NUMBER,
  ACTION VARCHAR2(20) NOT NULL,
  -- Le parametre de l'action : le statut a poser, le type de tache, ou le
  -- sujet de la notification. Une colonne, parce qu'une action n'en prend
  -- qu'un — trois colonnes vides sur quatre seraient pires.
  ACTION_PARAM VARCHAR2(200),
  ACTION_DELAI_JOURS NUMBER DEFAULT 7,
  DERNIER_PASSAGE TIMESTAMP,
  DERNIER_DECLENCHE NUMBER DEFAULT 0,
  CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT PK_AUTOMATISATION PRIMARY KEY (ID),
  CONSTRAINT UQ_AUTOMATISATION UNIQUE (CLIENT_ID, NOM),
  CONSTRAINT CK_AUTO_DECL CHECK (DECLENCHEUR IN (${DECLENCHEURS.map(d => `'${d}'`).join(', ')})),
  CONSTRAINT CK_AUTO_ACTION CHECK (ACTION IN (${ACTIONS.map(a => `'${a}'`).join(', ')})))`;

/*
 * Le journal est ce qui rend une regle sure : une personne ne la declenche
 * qu'une fois. Sans lui, le passage horaire rejouerait la meme action toutes
 * les heures — soixante relances par jour sur la meme fiche.
 */
const DDL_JOURNAL = `CREATE TABLE AUTOMATISATION_JOURNAL (
  AUTOMATISATION_ID NUMBER NOT NULL REFERENCES AUTOMATISATION(ID) ON DELETE CASCADE,
  PERSON_KEY VARCHAR2(620) NOT NULL,
  DECLENCHE_LE TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  RESULTAT VARCHAR2(400),
  CONSTRAINT PK_AUTO_JOURNAL PRIMARY KEY (AUTOMATISATION_ID, PERSON_KEY))`;

async function main() {
  const cn = await oracledb.getConnection({
    user: 'ADMIN', password: process.env.AP,
    connectString: process.env.ORA_CONNECT,
    configDir: '/tmp/wallet', walletLocation: '/tmp/wallet',
    walletPassword: process.env.ORA_WALLET_PASSWORD,
  });
  const q = (sql, b = {}) => cn.execute(sql, b, { autoCommit: true });
  await q(`ALTER SESSION SET CURRENT_SCHEMA = PROSPECTS`);

  const tab = async (o, t) => (await q(
    `SELECT COUNT(*) N FROM ALL_TABLES WHERE OWNER=:o AND TABLE_NAME=:t`, { o, t })).rows[0].N > 0;
  const col = async (o, t, c) => (await q(
    `SELECT COUNT(*) N FROM ALL_TAB_COLUMNS WHERE OWNER=:o AND TABLE_NAME=:t AND COLUMN_NAME=:c`,
    { o, t, c })).rows[0].N > 0;

  const etapes = [];
  if (!(await tab('PROSPECTS', 'AUTOMATISATION'))) etapes.push(['table AUTOMATISATION', DDL_AUTOMATISATION]);
  if (!(await tab('PROSPECTS', 'AUTOMATISATION_JOURNAL'))) etapes.push(['table JOURNAL', DDL_JOURNAL]);
  // Gabarits par mandat : NULL vaut « partage par tout Arx ».
  if (!(await col('INVESTORS', 'MAILING_TEMPLATES', 'CLIENT_ID')))
    etapes.push(['colonne gabarits',
      `ALTER TABLE INVESTORS.MAILING_TEMPLATES ADD (CLIENT_ID NUMBER)`]);
  etapes.push(['grant', `GRANT INSERT, UPDATE ON INVESTORS.MAILING_TEMPLATES TO PROSPECTS`]);

  if (!APPLIQUER) {
    etapes.forEach(([t, s]) => console.log(`-- ${t}\n${s};\n`));
    console.log('-- simulation.'); await cn.close(); return;
  }
  for (const [t, sql] of etapes) { await q(sql); console.log(`  ok ${t}`); }

  const v = await q(`SELECT (SELECT COUNT(*) FROM AUTOMATISATION) REGLES,
                            (SELECT COUNT(*) FROM INVESTORS.MAILING_TEMPLATES) GABARITS FROM DUAL`);
  console.log('  verif :', JSON.stringify(v.rows[0]));
  await cn.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
