import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise } from "@/lib/portee";

/*
 * Journal des envois unitaires — consultation seule.
 *
 * C'est la piece a ouvrir quand quelqu'un demande « ce message est-il vraiment
 * parti ? ». Elle rend l'etat brut du routeur, sans interpretation : statut,
 * horodatages de chaque evenement, motif de rebond.
 *
 * Le corps du message n'est PAS rendu : il porte des donnees personnelles et
 * l'ecran n'en a pas besoin pour repondre a la question posee.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  const cid = Number(req.query.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });
  res.setHeader("Cache-Control", "no-store");

  const w = [`c.CLIENT_ID = :cid`];
  const b: Record<string, unknown> = { cid, off: Number(req.query.page || 0) * 60 };
  if (req.query.statut) { w.push(`s.STATUS = :statut`); b.statut = String(req.query.statut); }
  if (req.query.q) {
    w.push(`UPPER(s.EMAIL) LIKE :q`); b.q = `%${String(req.query.q).toUpperCase()}%`;
  }
  const where = w.join(" AND ");

  const r = await q(`SELECT s.SEND_ID, s.EMAIL, s.STATUS, s.TRANSPORT, s.LANGUAGE,
                            s.RENDERED_SUBJECT, s.EXPEDITEUR_EMAIL,
                            s.SENT_AT, s.DELIVERED_AT, s.OPENED_AT, s.CLICKED_AT,
                            s.REPLIED_AT, s.BOUNCED_AT, s.BOUNCE_REASON, c.NAME CAMPAGNE
                       FROM INVESTORS.MAILING_SENDS s
                       JOIN INVESTORS.MAILING_CAMPAIGNS c ON c.CAMPAIGN_ID = s.CAMPAIGN_ID
                      WHERE ${where}
                      ORDER BY NVL(s.SENT_AT, s.UPDATED_AT) DESC
                      OFFSET :off ROWS FETCH NEXT 60 ROWS ONLY`, b);
  const n = await q(`SELECT COUNT(*) N FROM INVESTORS.MAILING_SENDS s
                       JOIN INVESTORS.MAILING_CAMPAIGNS c ON c.CAMPAIGN_ID = s.CAMPAIGN_ID
                      WHERE ${where}`,
                    Object.fromEntries(Object.entries(b).filter(([k]) => k !== "off")));
  res.json({ total: (n.rows as { N: number }[])[0].N, rows: r.rows });
}
