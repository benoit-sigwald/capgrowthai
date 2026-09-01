import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";

/*
 * Bibliotheque de gabarits.
 *
 * CLIENT_ID nul vaut « partage par tout Arx ». Un gabarit de mandat prime sur
 * le partage pour la meme langue — c'est le mailer qui applique cette
 * preference a la preparation.
 *
 * Les gabarits sont VERSIONNES et jamais supprimes : un envoi passe doit
 * garder la trace du contenu exact qui lui a ete applique. Desactiver, oui ;
 * effacer, non.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  if (req.method === "GET") {
    const r = await q(`SELECT TEMPLATE_ID, NAME, LANGUAGE, SUBJECT, VERSION, IS_ACTIVE,
                              CLIENT_ID, UPDATED_AT,
                              DBMS_LOB.SUBSTR(BODY, 3000, 1) CORPS
                         FROM INVESTORS.MAILING_TEMPLATES
                        WHERE CHANNEL = 'email' AND (CLIENT_ID = :cid OR CLIENT_ID IS NULL)
                        ORDER BY CLIENT_ID NULLS LAST, LANGUAGE`, { cid });
    return res.json({ rows: r.rows });
  }

  if (req.method === "POST") {
    const { template_id, nom, langue, sujet, corps, actif } = (req.body ?? {}) as
      Record<string, string | number | undefined>;
    const tid = String(template_id ?? "").trim();
    if (!tid || !String(langue ?? "").trim() || !String(sujet ?? "").trim())
      return res.status(400).json({ erreur: "template_id, langue et sujet requis" });

    // Un gabarit partage (CLIENT_ID nul) ne se modifie pas depuis un mandat :
    // il appartient a Arx, et le changer ici toucherait tous les mandats.
    const exist = await q(`SELECT CLIENT_ID FROM INVESTORS.MAILING_TEMPLATES
                            WHERE TEMPLATE_ID = :t`, { t: tid });
    const ligne = (exist.rows as { CLIENT_ID: number | null }[])[0];
    if (ligne && ligne.CLIENT_ID === null && p.role !== "admin")
      return res.status(403).json({ erreur: "gabarit partagé Arx : modification réservée à l'administrateur" });
    if (ligne && ligne.CLIENT_ID !== null && ligne.CLIENT_ID !== cid)
      return res.status(403).json({ erreur: "gabarit d'un autre mandat" });

    await q(`MERGE INTO INVESTORS.MAILING_TEMPLATES t
             USING (SELECT :tid TEMPLATE_ID FROM DUAL) s ON (t.TEMPLATE_ID = s.TEMPLATE_ID)
             WHEN MATCHED THEN UPDATE SET NAME = :nom, SUBJECT = :sujet, BODY = :corps,
                    LANGUAGE = :lg, IS_ACTIVE = NVL(:actif, IS_ACTIVE),
                    VERSION = VERSION + 1, UPDATED_AT = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT (TEMPLATE_ID, NAME, CHANNEL, LANGUAGE, SUBJECT,
                    BODY, TONE, VERSION, IS_ACTIVE, CLIENT_ID, CREATED_AT, UPDATED_AT)
               VALUES (:tid, :nom, 'email', :lg, :sujet, :corps, 'punchy', 1,
                       NVL(:actif, 1), :cid, SYSTIMESTAMP, SYSTIMESTAMP)`,
            { tid, nom: String(nom ?? tid), sujet: String(sujet), corps: String(corps ?? ""),
              lg: String(langue), actif: actif != null ? Number(actif) : null, cid });
    return res.json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "POST"]); res.status(405).end();
}
