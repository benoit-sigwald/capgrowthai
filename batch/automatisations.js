'use strict';
/*
 * Moteur d'automatisation — regles « si… alors… », passees en revue a chaque
 * passage horaire du conteneur batch.
 *
 *   node automatisations.js              simulation : dit ce qu'il ferait
 *   node automatisations.js --appliquer  agit
 *
 * Trois partis pris.
 *
 * 1. Pas de temps reel. La latence est d'au plus une heure, et elle est
 *    affichee telle quelle dans l'ecran. Un bus d'evenements aurait ete une
 *    piece de plus a maintenir pour gagner cinquante minutes sur une relance.
 *
 * 2. Une regle ne se declenche qu'UNE FOIS par personne. C'est
 *    AUTOMATISATION_JOURNAL qui le garantit : sans lui, le passage horaire
 *    rejouerait la meme action toutes les heures — soixante relances par jour
 *    sur la meme fiche.
 *
 * 3. Une regle ne cree jamais un envoi. Elle pose une tache, change un statut
 *    ou notifie. Faire partir un message sans qu'un humain l'ait voulu est la
 *    facon la plus rapide de bruler un domaine et une reputation.
 */
const https = require('https');
const { q, fermer } = require('./oracle');

const APPLIQUER = process.argv.includes('--appliquer');
const NTFY = process.env.NTFY_SUJET || 'arx-prospects-1';

/*
 * Ce qui rend une regle « declenchable » pour une personne, par declencheur.
 *
 * Chaque requete rend PERSON_KEY. Elles lisent des faits deja etablis
 * (INTERACTION, CONTACT_STATE), jamais des suppositions.
 */
const DECLENCHEURS = {
  // Quelqu'un a repondu : l'evenement le plus couteux a rater.
  reponse: `
    SELECT DISTINCT i.PERSON_KEY
      FROM INTERACTION i
     WHERE i.TYPE = 'reponse' AND i.CLIENT_ID = :cid`,

  clic: `
    SELECT DISTINCT i.PERSON_KEY
      FROM INTERACTION i
     WHERE i.TYPE = 'clic' AND i.CLIENT_ID = :cid`,

  rebond: `
    SELECT DISTINCT i.PERSON_KEY
      FROM INTERACTION i
     WHERE i.TYPE = 'rebond' AND i.CLIENT_ID = :cid`,

  inscription: `
    SELECT DISTINCT i.PERSON_KEY
      FROM INTERACTION i
     WHERE i.TYPE = 'inscription'`,

  // Contacte il y a N jours et toujours muet. Le NOT EXISTS est le coeur :
  // une reponse, meme tardive, annule le silence.
  sans_reponse: `
    SELECT e.PERSON_KEY
      FROM CONTACT_STATE e
     WHERE e.CLIENT_ID = :cid
       AND e.DERNIER_CONTACT_LE IS NOT NULL
       AND e.DERNIER_CONTACT_LE < SYSTIMESTAMP - NUMTODSINTERVAL(:delai, 'DAY')
       AND e.DERNIERE_REPONSE_LE IS NULL
       AND e.OPT_OUT = 0
       AND NOT EXISTS (SELECT 1 FROM INTERACTION i
                        WHERE i.PERSON_KEY = e.PERSON_KEY AND i.SENS = 'entrant')`,
};

function notifier(titre, message) {
  return new Promise(resolve => {
    const corps = Buffer.from(message, 'utf8');
    const req = https.request({
      hostname: 'ntfy.sh', path: `/${NTFY}`, method: 'POST',
      headers: { 'Title': Buffer.from(titre, 'utf8').toString('base64'),
                 'X-Title-Encoding': 'base64',
                 'Content-Length': corps.length },
      timeout: 10000,
    }, r => { r.resume(); resolve(r.statusCode); });
    // Une notification qui echoue ne doit pas arreter le passage : la regle a
    // deja fait son travail utile en base.
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(corps);
  });
}

async function appliquerAction(regle, personKey) {
  const cid = regle.CLIENT_ID;
  if (regle.ACTION === 'statut') {
    const statut = regle.ACTION_PARAM || 'a_reveiller';
    // Les statuts « actifs » exigent une action datee (CK_CS_ACTION_DUE) :
    // on la pose avec la regle, sinon la base refuserait a juste titre.
    await q(`MERGE INTO CONTACT_STATE c
             USING (SELECT :k PERSON_KEY, :cid CLIENT_ID FROM DUAL) s
               ON (c.PERSON_KEY = s.PERSON_KEY AND c.CLIENT_ID = s.CLIENT_ID)
             WHEN MATCHED THEN UPDATE SET STATUT = :st,
                    ACTION_TYPE = NVL(ACTION_TYPE, 'relance'),
                    ACTION_LE = NVL(ACTION_LE, TRUNC(SYSDATE) + :d),
                    UPDATED_AT = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT (PERSON_KEY, CLIENT_ID, STATUT,
                    ACTION_TYPE, ACTION_LE, ORIGINE_ETAT)
               VALUES (:k, :cid, :st, 'relance', TRUNC(SYSDATE) + :d, 'automatisation')`,
            { k: personKey, cid, st: statut, d: regle.ACTION_DELAI_JOURS ?? 7 });
    return `statut ${statut}`;
  }

  if (regle.ACTION === 'tache') {
    const type = regle.ACTION_PARAM || 'relance';
    await q(`MERGE INTO CONTACT_STATE c
             USING (SELECT :k PERSON_KEY, :cid CLIENT_ID FROM DUAL) s
               ON (c.PERSON_KEY = s.PERSON_KEY AND c.CLIENT_ID = s.CLIENT_ID)
             WHEN MATCHED THEN UPDATE SET ACTION_TYPE = :t,
                    ACTION_LE = TRUNC(SYSDATE) + :d,
                    ACTION_NOTE = NVL(ACTION_NOTE, :note), UPDATED_AT = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT (PERSON_KEY, CLIENT_ID, STATUT,
                    ACTION_TYPE, ACTION_LE, ACTION_NOTE, ORIGINE_ETAT)
               VALUES (:k, :cid, 'contacte', :t, TRUNC(SYSDATE) + :d, :note, 'automatisation')`,
            { k: personKey, cid, t: type, d: regle.ACTION_DELAI_JOURS ?? 7,
              note: `posee par « ${regle.NOM} »` });
    return `tache ${type}`;
  }

  if (regle.ACTION === 'notifier') {
    const p = await q(`SELECT FIRST_NAME, LAST_NAME, COMPANY, EMAIL
                         FROM V_PERSONNES WHERE PERSON_KEY = :k`, { k: personKey });
    const f = p.rows[0] || {};
    const qui = [f.FIRST_NAME, f.LAST_NAME].filter(Boolean).join(' ') || personKey;
    const code = await notifier(regle.ACTION_PARAM || regle.NOM,
      `${qui}${f.COMPANY ? ` (${f.COMPANY})` : ''}${f.EMAIL ? ` — ${f.EMAIL}` : ''}`);
    return `notifie ${code ?? 'echec'}`;
  }
  return 'action inconnue';
}

async function main() {
  const regles = await q(`SELECT ID, CLIENT_ID, NOM, DECLENCHEUR, DELAI_JOURS,
                                 ACTION, ACTION_PARAM, ACTION_DELAI_JOURS
                            FROM AUTOMATISATION WHERE ACTIF = 1 ORDER BY ID`);
  if (!regles.rows.length) { console.log('aucune regle active'); await fermer(); return; }

  let totalDeclenche = 0;
  for (const r of regles.rows) {
    const sql = DECLENCHEURS[r.DECLENCHEUR];
    if (!sql) { console.log(`  ${r.NOM} : declencheur inconnu (${r.DECLENCHEUR})`); continue; }

    const binds = { cid: r.CLIENT_ID };
    if (r.DECLENCHEUR === 'sans_reponse') binds.delai = r.DELAI_JOURS ?? 7;

    // Le NOT EXISTS sur le journal fait toute la surete : une personne deja
    // traitee par cette regle n'y revient pas.
    const cibles = await q(`SELECT PERSON_KEY FROM (${sql}) c
                             WHERE NOT EXISTS (SELECT 1 FROM AUTOMATISATION_JOURNAL j
                                                WHERE j.AUTOMATISATION_ID = :rid
                                                  AND j.PERSON_KEY = c.PERSON_KEY)
                             FETCH FIRST 200 ROWS ONLY`, { ...binds, rid: r.ID });

    if (!APPLIQUER) {
      console.log(`  ${r.NOM} [${r.DECLENCHEUR} -> ${r.ACTION}] : ${cibles.rows.length} declencherait`);
      continue;
    }

    let n = 0;
    for (const c of cibles.rows) {
      let resultat;
      try { resultat = await appliquerAction(r, c.PERSON_KEY); }
      catch (e) { resultat = `echec : ${String(e.message).slice(0, 120)}`; }
      // Le journal est ecrit meme en cas d'echec : reessayer toutes les heures
      // une action qui echoue n'apporte rien et brouille le journal.
      await q(`INSERT INTO AUTOMATISATION_JOURNAL (AUTOMATISATION_ID, PERSON_KEY, RESULTAT)
               VALUES (:rid, :k, :res)`,
              { rid: r.ID, k: c.PERSON_KEY, res: resultat });
      n++;
    }
    await q(`UPDATE AUTOMATISATION SET DERNIER_PASSAGE = SYSTIMESTAMP,
                    DERNIER_DECLENCHE = :n, UPDATED_AT = SYSTIMESTAMP WHERE ID = :rid`,
            { n, rid: r.ID });
    totalDeclenche += n;
    console.log(`  ${r.NOM} [${r.DECLENCHEUR} -> ${r.ACTION}] : ${n} declenchee(s)`);
  }

  console.log(APPLIQUER ? `total : ${totalDeclenche} declenchement(s)` : 'simulation : rien ecrit.');
  await fermer();
}

main().catch(async e => { console.error(e.message); await fermer().catch(() => {}); process.exit(1); });
