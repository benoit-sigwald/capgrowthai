'use strict';
/*
 * Les droits deviennent PAR MANDAT.
 *
 * Jusqu'ici un compte portait un role unique, valable partout. C'est trop
 * grossier : quelqu'un peut travailler le referentiel sur un mandat et n'avoir
 * qu'un droit de lecture sur un autre. Le role descend donc sur AFFECTATION.
 *
 * UTILISATEUR.ROLE ne garde qu'une chose : « admin » ou non. Un admin voit
 * tout par construction ; pour les autres, ce sont les affectations qui
 * decident, mandat par mandat.
 *
 *   sudo docker exec -w /app -e AP="$(sudo cat /root/.ora_admin)" <gate> \
 *     node creer-socle-droits.js --appliquer
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

  const etapes = [];
  if (!(await col('AFFECTATION', 'ROLE'))) {
    etapes.push(['colonne', `ALTER TABLE AFFECTATION ADD (ROLE VARCHAR2(10) DEFAULT 'membre')`]);
    // Reprise : chaque affectation herite du role global qu'avait le compte.
    etapes.push(['reprise', `UPDATE AFFECTATION a SET ROLE =
        (SELECT CASE WHEN u.ROLE = 'client' THEN 'client' ELSE 'membre' END
           FROM UTILISATEUR u WHERE u.ID = a.UTILISATEUR_ID)`]);
    etapes.push(['obligatoire', `ALTER TABLE AFFECTATION MODIFY (ROLE NOT NULL)`]);
    etapes.push(['controle', `ALTER TABLE AFFECTATION ADD CONSTRAINT CK_AFFECT_ROLE
        CHECK (ROLE IN ('membre','client'))`]);
  }

  if (!APPLIQUER) {
    etapes.forEach(([t, s]) => console.log(`-- ${t}\n${s};\n`));
    console.log('-- simulation.'); await cn.close(); return;
  }
  for (const [t, sql] of etapes) { await q(sql); console.log(`  ok ${t}`); }

  const v = await q(`SELECT u.EMAIL, u.ROLE ROLE_GLOBAL, c.NOM MANDAT, a.ROLE ROLE_MANDAT
                       FROM UTILISATEUR u
                       LEFT JOIN AFFECTATION a ON a.UTILISATEUR_ID = u.ID
                       LEFT JOIN CLIENT c ON c.ID = a.CLIENT_ID ORDER BY u.EMAIL`);
  console.log('  droits :', JSON.stringify(v.rows));
  await cn.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
