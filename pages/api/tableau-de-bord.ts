import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  const cid = Number(req.query.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  const [envois, campagnes, reponses] = await Promise.all([
    q(`SELECT COUNT(CASE WHEN s.SENT_AT >= TRUNC(SYSDATE) THEN 1 END) AUJOURDHUI,
              COUNT(CASE WHEN s.STATUS = 'pending' THEN 1 END) EN_ATTENTE
         FROM INVESTORS.MAILING_SENDS s
         JOIN INVESTORS.MAILING_CAMPAIGNS c ON c.CAMPAIGN_ID = s.CAMPAIGN_ID
        WHERE c.CLIENT_ID = :cid`, { cid }),
    q(`SELECT c.CAMPAIGN_ID, c.NAME, c.CREATED_AT, c.TOTAL_TARGETED,
              COUNT(CASE WHEN s.SENT_AT IS NOT NULL THEN 1 END) ENVOYES,
              COUNT(CASE WHEN s.REPLIED_AT IS NOT NULL THEN 1 END) REPONDUS
         FROM INVESTORS.MAILING_CAMPAIGNS c
         LEFT JOIN INVESTORS.MAILING_SENDS s ON s.CAMPAIGN_ID = c.CAMPAIGN_ID
        WHERE c.CLIENT_ID = :cid
        GROUP BY c.CAMPAIGN_ID, c.NAME, c.CREATED_AT, c.TOTAL_TARGETED
        ORDER BY c.CREATED_AT DESC FETCH FIRST 5 ROWS ONLY`, { cid }),
    // L'etat commercial n'est pas encore par mandat (tranche 3) : le compteur
    // est celui d'Arx, et l'ecran le dit tel quel.
    contactsAutorises(p)
      ? q(`SELECT COUNT(*) N FROM CONTACT_STATE WHERE STATUT = 'a_repondu'`)
      : Promise.resolve({ rows: [{ N: null }] }),
  ]);
  res.json({
    envois: envois.rows?.[0] ?? {},
    dernieres_campagnes: campagnes.rows,
    reponses_a_traiter: (reponses.rows as { N: number | null }[])[0].N,
  });
}
