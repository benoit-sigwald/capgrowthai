import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { appelMailer, RefusMailer } from "@/lib/mailer";

/*
 * Les reponses recues, et la reponse qu'on y fait.
 *
 * Une reponse est le seul evenement d'une campagne qui demande quelque chose :
 * une ouverture se compte, une reponse s'honore. Elle vivait pourtant dans une
 * colonne que rien n'affichait — REPLY_SNIPPET, remplie par la relecture de la
 * boite d'envoi.
 *
 * L'envoi passe par le routeur, sous l'adresse de la CAMPAGNE : le contact a
 * ecrit a quelqu'un, la reponse vient de la meme personne.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  if (req.method === "GET") {
    const r = await q(`
      SELECT s.SEND_ID, s.EMAIL, s.REPLIED_AT, s.RENDERED_SUBJECT, s.REPLY_SNIPPET,
             s.STATUS, s.EXPEDITEUR_EMAIL, c.NAME CAMPAGNE, c.CAMPAIGN_ID,
             v.FIRST_NAME, v.LAST_NAME, v.COMPANY, v.PERSON_KEY,
             -- Ce qu'on a deja repondu, s'il y a lieu : sans cela on repond deux fois.
             (SELECT MAX(i.QUAND) FROM INTERACTION i
               WHERE i.SOURCE_REF = 'reponse:' || s.SEND_ID AND i.SENS = 'sortant') REPONDU_LE
        FROM INVESTORS.MAILING_SENDS s
        JOIN INVESTORS.MAILING_CAMPAIGNS c ON c.CAMPAIGN_ID = s.CAMPAIGN_ID
        LEFT JOIN V_PERSONNES v ON LOWER(v.EMAIL) = LOWER(s.EMAIL)
                               AND v.PERSON_KEY LIKE 'inv:%'
       WHERE s.REPLIED_AT IS NOT NULL AND c.CLIENT_ID = :cid
       ORDER BY s.REPLIED_AT DESC
       FETCH FIRST 200 ROWS ONLY`, { cid });
    return res.json({ rows: r.rows });
  }

  if (req.method === "POST") {
    const { send_id, corps, sujet } = (req.body ?? {}) as
      { send_id?: string; corps?: string; sujet?: string };
    if (!send_id || !corps?.trim())
      return res.status(400).json({ erreur: "send_id et corps requis" });

    // L'envoi doit appartenir a ce mandat : un send_id se devine.
    const v = await q(`SELECT s.EMAIL, c.CLIENT_ID FROM INVESTORS.MAILING_SENDS s
                       JOIN INVESTORS.MAILING_CAMPAIGNS c ON c.CAMPAIGN_ID = s.CAMPAIGN_ID
                       WHERE s.SEND_ID = :s`, { s: send_id });
    const l = (v.rows as { EMAIL: string; CLIENT_ID: number | null }[])[0];
    if (!l || l.CLIENT_ID !== cid) return res.status(404).json({ erreur: "réponse inconnue" });

    let envoi;
    try {
      envoi = await appelMailer("/repondre", { send_id, corps, sujet }) as
        Record<string, string>;
    } catch (e) {
      if (e instanceof RefusMailer) return res.status(422).json({ erreur: e.message });
      throw e;
    }

    /*
     * La trace dans le CRM. SOURCE_REF porte le send_id : c'est ce qui permet
     * de savoir qu'on a deja repondu, et d'empecher la reconciliation de
     * dupliquer la frise au passage suivant.
     */
    const cle = (await q(`SELECT PERSON_KEY FROM V_PERSONNES
                           WHERE LOWER(EMAIL) = LOWER(:e) AND PERSON_KEY LIKE 'inv:%'
                           FETCH FIRST 1 ROWS ONLY`, { e: l.EMAIL }))
                .rows as { PERSON_KEY: string }[];
    if (cle.length) {
      await q(`MERGE INTO INTERACTION i
               USING (SELECT :ref SOURCE_REF FROM DUAL) s ON (i.SOURCE_REF = s.SOURCE_REF)
               WHEN NOT MATCHED THEN INSERT
                 (PERSON_KEY, QUAND, CANAL, TYPE, SENS, RESUME, ORIGINE, SOURCE_REF,
                  AUTEUR, CLIENT_ID)
                 VALUES (:pk, SYSTIMESTAMP, 'email', 'message', 'sortant', :resume,
                         'capgrowth', :ref, :qui, :cid)`,
              { ref: `reponse:${send_id}`, pk: cle[0].PERSON_KEY,
                resume: corps.trim().slice(0, 400), qui: `uid:${p.uid}`, cid });
    }
    return res.json({ ok: true, ...envoi });
  }

  res.setHeader("Allow", ["GET", "POST"]); res.status(405).end();
}
