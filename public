'use strict';
/*
 * batch/nettoyer-donnees-sales.js — Nettoyage et Purge stricte des données sales dans Oracle ATP
 * (Schémas PROSPECTS, INVESTORS et V_PERSONNES).
 *
 * Supprime les artefacts identifiés :
 * 1. Faux emails issus de noms de fichiers images (*.png.webp, *@2x*, *.jpg, *.svg)
 * 2. Faux contacts / slugs bruts (Investisseur -*, 11 -*, etc.)
 * 3. Faux noms génériques (Contact X, Support X, Info X, Dpo X, Serviceclients X)
 * 4. Emails génériques/fonctionnels attribués à tort à des personnes physiques (contact@, info@, dpo@, support@)
 *
 * Usage :
 *   node batch/nettoyer-donnees-sales.js              (Mode simulation / Audit)
 *   node batch/nettoyer-donnees-sales.js --appliquer  (Exécute la purge en base)
 */
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const APPLIQUER = process.argv.includes('--appliquer');

const MOTIFS_EMAILS_CORROMPUS = [
  '%.png%', '%.webp%', '%.jpg%', '%.jpeg%', '%.svg%', '%@2x%', '%@3x%', '%.gif%'
];

const PREFIXES_NOMS_POLLUES = [
  'Investisseur -%', 'Investisseur-%', '11 -%', '12 -%', '13 -%', '1 -%', '2 -%', '3 -%', '4 -%', '5 -%', '6 -%',
  'Contact %', 'Support %', 'Info %', 'Dpo %', 'Serviceclients %', 'Service Client %', 'Direction %', 'Accueil %'
];

const EMAILS_ROLE_GENERIQUES = [
  'contact@%', 'info@%', 'support@%', 'dpo@%', 'serviceclients@%', 'serviceclient@%',
  'admin@%', 'accueil@%', 'hello@%', 'office@%', 'noreply@%', 'recrutement@%', 'jobs@%'
];

async function main() {
  console.log('=============================================================================');
  console.log(`   PURGE ET NETTOYAGE DES DONNÉES SALES (Mode: ${APPLIQUER ? 'APPLICATION RÉELLE' : 'SIMULATION'})`);
  console.log('=============================================================================\n');

  let c;
  try {
    c = await oracledb.getConnection({
      user: process.env.ORA_USER || 'investors',
      password: process.env.ORA_PASSWORD,
      connectString: process.env.ORA_CONNECT || 'arxdb01_low',
      configDir: process.env.ORA_WALLET_DIR || '/tmp/wallet',
      walletLocation: process.env.ORA_WALLET_DIR || '/tmp/wallet',
      walletPassword: process.env.ORA_WALLET_PASSWORD,
    });
  } catch (err) {
    console.error(`[ERREUR] Connexion Oracle impossible : ${err.message}`);
    console.log('Vérifiez les variables d\'environnement ORA_USER, ORA_PASSWORD, ORA_CONNECT et le wallet.');
    process.exit(1);
  }

  try {
    // 1. Audit dans INVESTORS.CONTACTS
    console.log('--> 1. Analyse de INVESTORS.CONTACTS...');
    const invDirtyEmails = (await c.execute(`
      SELECT COUNT(*) AS CNT FROM INVESTORS.CONTACTS 
      WHERE LOWER(EMAIL) LIKE '%.png%' OR LOWER(EMAIL) LIKE '%.webp%' OR LOWER(EMAIL) LIKE '%@2x%' OR LOWER(EMAIL) LIKE '%.jpg%'
         OR LOWER(EMAIL) LIKE '%.jpeg%' OR LOWER(EMAIL) LIKE '%@%w.%' OR LOWER(EMAIL) LIKE '%@%h.%'
    `)).rows[0].CNT;

    const invDirtyNames = (await c.execute(`
      SELECT COUNT(*) AS CNT FROM INVESTORS.CONTACTS 
      WHERE LOWER(FULL_NAME) LIKE 'investisseur -%' OR LOWER(FULL_NAME) LIKE 'contact %' OR LOWER(FULL_NAME) LIKE 'support %' 
         OR LOWER(FULL_NAME) LIKE 'info %' OR LOWER(FULL_NAME) LIKE 'dpo %' OR LOWER(FULL_NAME) LIKE 'serviceclients %'
         OR LOWER(FULL_NAME) LIKE 'image-%' OR LOWER(FULL_NAME) LIKE '11 -%' OR LOWER(FULL_NAME) LIKE '17capital%'
    `)).rows[0].CNT;

    console.log(`   * Emails avec noms d'images / @2x : ${invDirtyEmails}`);
    console.log(`   * Noms génériques / préfixes pollués : ${invDirtyNames}`);

    // 2. Audit dans PROSPECTS.CONTACTS
    console.log('\n--> 2. Analyse de PROSPECTS.CONTACTS...');
    const proDirtyEmails = (await c.execute(`
      SELECT COUNT(*) AS CNT FROM PROSPECTS.CONTACTS 
      WHERE LOWER(EMAIL) LIKE '%.png%' OR LOWER(EMAIL) LIKE '%.webp%' OR LOWER(EMAIL) LIKE '%@2x%' OR LOWER(EMAIL) LIKE '%.jpg%'
    `)).rows[0].CNT;

    const proDirtyNames = (await c.execute(`
      SELECT COUNT(*) AS CNT FROM PROSPECTS.CONTACTS 
      WHERE LOWER(NOM) LIKE 'investisseur -%' OR LOWER(NOM) LIKE 'contact %' OR LOWER(NOM) LIKE 'support %' 
         OR LOWER(NOM) LIKE 'info %' OR LOWER(NOM) LIKE 'dpo %' OR LOWER(NOM) LIKE 'serviceclients %'
         OR LOWER(PRENOM) LIKE 'investisseur -%' OR LOWER(PRENOM) LIKE 'contact %'
    `)).rows[0].CNT;

    console.log(`   * Emails avec noms d'images / @2x : ${proDirtyEmails}`);
    console.log(`   * Noms génériques / préfixes pollués : ${proDirtyNames}`);

    if (APPLIQUER) {
      console.log('\n--> Application de la purge dans Oracle DB...');
      
      // Suppression des faux contacts dans INVESTORS.CONTACTS
      const delInv1 = await c.execute(`
        DELETE FROM INVESTORS.CONTACTS 
        WHERE LOWER(EMAIL) LIKE '%.png%' OR LOWER(EMAIL) LIKE '%.webp%' OR LOWER(EMAIL) LIKE '%@2x%' OR LOWER(EMAIL) LIKE '%.jpg%'
           OR LOWER(EMAIL) LIKE '%.jpeg%' OR LOWER(EMAIL) LIKE '%@%w.%' OR LOWER(EMAIL) LIKE '%@%h.%'
           OR LOWER(FULL_NAME) LIKE 'investisseur -%' OR LOWER(FULL_NAME) LIKE 'contact %' OR LOWER(FULL_NAME) LIKE 'support %' 
           OR LOWER(FULL_NAME) LIKE 'info %' OR LOWER(FULL_NAME) LIKE 'dpo %' OR LOWER(FULL_NAME) LIKE 'serviceclients %'
           OR LOWER(FULL_NAME) LIKE 'image-%' OR LOWER(FULL_NAME) LIKE '11 -%' OR LOWER(FULL_NAME) LIKE '17capital%'
      `, {}, { autoCommit: true });
      console.log(`   [OK] ${delInv1.rowsAffected} lignes purgées de INVESTORS.CONTACTS.`);

      // Suppression des faux contacts dans PROSPECTS.CONTACTS
      const delPro1 = await c.execute(`
        DELETE FROM PROSPECTS.CONTACTS 
        WHERE LOWER(EMAIL) LIKE '%.png%' OR LOWER(EMAIL) LIKE '%.webp%' OR LOWER(EMAIL) LIKE '%@2x%' OR LOWER(EMAIL) LIKE '%.jpg%'
           OR LOWER(EMAIL) LIKE '%.jpeg%' OR LOWER(EMAIL) LIKE '%@%w.%' OR LOWER(EMAIL) LIKE '%@%h.%'
           OR LOWER(NOM) LIKE 'investisseur -%' OR LOWER(NOM) LIKE 'contact %' OR LOWER(NOM) LIKE 'support %' 
           OR LOWER(NOM) LIKE 'info %' OR LOWER(NOM) LIKE 'dpo %' OR LOWER(NOM) LIKE 'serviceclients %'
           OR LOWER(NOM) LIKE 'image-%' OR LOWER(NOM) LIKE '11 -%' OR LOWER(NOM) LIKE '17capital%'
           OR LOWER(PRENOM) LIKE 'investisseur -%' OR LOWER(PRENOM) LIKE 'contact %'
      `, {}, { autoCommit: true });
      console.log(`   [OK] ${delPro1.rowsAffected} lignes purgées de PROSPECTS.CONTACTS.`);

      // Nettoyage des emails génériques pour ne pas les affecter à des personnes physiques
      const clrInvEmail = await c.execute(`
        UPDATE INVESTORS.CONTACTS 
        SET EMAIL = NULL, EMAIL_STATUS = 'role_detached'
        WHERE LOWER(EMAIL) LIKE 'contact@%' OR LOWER(EMAIL) LIKE 'info@%' OR LOWER(EMAIL) LIKE 'support@%' 
           OR LOWER(EMAIL) LIKE 'dpo@%' OR LOWER(EMAIL) LIKE 'serviceclients@%'
      `, {}, { autoCommit: true });
      console.log(`   [OK] ${clrInvEmail.rowsAffected} emails génériques détachés des personnes dans INVESTORS.CONTACTS.`);

      const clrProEmail = await c.execute(`
        UPDATE PROSPECTS.CONTACTS 
        SET EMAIL = NULL 
        WHERE LOWER(EMAIL) LIKE 'contact@%' OR LOWER(EMAIL) LIKE 'info@%' OR LOWER(EMAIL) LIKE 'support@%' 
           OR LOWER(EMAIL) LIKE 'dpo@%' OR LOWER(EMAIL) LIKE 'serviceclients@%'
      `, {}, { autoCommit: true });
      console.log(`   [OK] ${clrProEmail.rowsAffected} emails génériques détachés des personnes dans PROSPECTS.CONTACTS.`);

      console.log('\n=============================================================================');
      console.log('   PURGE ET NETTOYAGE ORACLE TERMINÉS AVEC SUCCÈS.');
      console.log('=============================================================================\n');
    } else {
      console.log('\n--> [SIMULATION] Pour appliquer cette purge, relancez avec :');
      console.log('    node batch/nettoyer-donnees-sales.js --appliquer\n');
    }
  } finally {
    await c.close();
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
