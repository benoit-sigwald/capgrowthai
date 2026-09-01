import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise } from "@/lib/portee";

/*
 * Statistiques d'un mandat.
 *
 * Tous les taux se lisent SUR LES ENVOIS, jamais sur les cibles : une cible
 * qui n'a rien recu fausserait le denominateur et flatterait le resultat.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  const cid = Number(req.query.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });
  const jours = Math.min(Number(req.query.jours) || 90, 365);

  const [global, parJour, parCampagne, parDomaine] = await Promise.all([
    q(`SELECT COUNT(CASE WHEN s.SENT_AT IS NOT NULL THEN 1 END) ENVOYES,
              COUNT(CASE WHEN s.OPENED_AT IS NOT NULL THEN 1 END) OUVERTS,
              COUNT(CASE WHEN s.CLICKED_AT IS NOT NULL THEN 1 END) CLIQUES,
              COUNT(CASE WHEN s.REPLIED_AT IS NOT NULL THEN 1 END) REPONDUS,
              COUNT(CASE WHEN s.BOUNCED_AT IS NOT NULL THEN 1 END) REBONDS,
              COUNT(CASE WHEN s.STATUS = 'pending' THEN 1 END) EN_ATTENTE,
              COUNT(DISTINCT s.CONTACT_ID) PERSONNES
         FROM INVESTORS.MAILING_SENDS s
         JOIN INVESTORS.MAILING_CAMPAIGNS c ON c.CAMPAIGN_ID = s.CAMPAIGN_ID
        WHERE c.CLIENT_ID = :cid`, { cid }),
    q(`SELECT TO_CHAR(TRUNC(s.SENT_AT), 'YYYY-MM-DD') JOUR,
              COUNT(*) ENVOYES,
              COUNT(CASE WHEN s.OPENED_AT IS NOT NULL THEN 1 END) OUVERTS,
              COUNT(CASE WHEN s.REPLIED_AT IS NOT NULL THEN 1 END) REPONDUS
         FROM INVESTORS.MAILING_SENDS s
         JOIN INVESTORS.MAILING_CAMPAIGNS c ON c.CAMPAIGN_ID = s.CAMPAIGN_ID
        WHERE c.CLIENT_ID = :cid AND s.SENT_AT >= TRUNC(SYSDATE) - :j
        GROUP BY TRUNC(s.SENT_AT) ORDER BY TRUNC(s.SENT_AT) DESC`, { cid, j: jours }),
    q(`SELECT c.NAME, c.CREATED_AT, c.TOTAL_TARGETED,
              COUNT(CASE WHEN s.SENT_AT IS NOT NULL THEN 1 END) ENVOYES,
              COUNT(CASE WHEN s.OPENED_AT IS NOT NULL THEN 1 END) OUVERTS,
              COUNT(CASE WHEN s.CLICKED_AT IS NOT NULL THEN 1 END) CLIQUES,
              COUNT(CASE WHEN s.REPLIED_AT IS NOT NULL THEN 1 END) REPONDUS,
              COUNT(CASE WHEN s.BOUNCED_AT IS NOT NULL THEN 1 END) REBONDS
         FROM INVESTORS.MAILING_CAMPAIGNS c
         LEFT JOIN INVESTORS.MAILING_SENDS s ON s.CAMPAIGN_ID = c.CAMPAIGN_ID
        WHERE c.CLIENT_ID = :cid
        GROUP BY c.NAME, c.CREATED_AT, c.TOTAL_TARGETED
        ORDER BY c.CREATED_AT DESC`, { cid }),
    // Par domaine expediteur : c'est la maille du chauffage et de la
    // reputation, donc celle qui compte pour lire une delivrabilite.
    q(`SELECT LOWER(SUBSTR(NVL(s.EXPEDITEUR_EMAIL, c.EXPEDITEUR_EMAIL),
                    INSTR(NVL(s.EXPEDITEUR_EMAIL, c.EXPEDITEUR_EMAIL), '@') + 1)) DOMAINE,
              COUNT(CASE WHEN s.SENT_AT IS NOT NULL THEN 1 END) ENVOYES,
              COUNT(CASE WHEN s.BOUNCED_AT IS NOT NULL THEN 1 END) REBONDS
         FROM INVESTORS.MAILING_SENDS s
         JOIN INVESTORS.MAILING_CAMPAIGNS c ON c.CAMPAIGN_ID = s.CAMPAIGN_ID
        WHERE c.CLIENT_ID = :cid AND NVL(s.EXPEDITEUR_EMAIL, c.EXPEDITEUR_EMAIL) IS NOT NULL
        GROUP BY LOWER(SUBSTR(NVL(s.EXPEDITEUR_EMAIL, c.EXPEDITEUR_EMAIL),
                       INSTR(NVL(s.EXPEDITEUR_EMAIL, c.EXPEDITEUR_EMAIL), '@') + 1))`, { cid }),
  ]);

  res.json({ global: global.rows?.[0] ?? {}, par_jour: parJour.rows,
             par_campagne: parCampagne.rows, par_domaine: parDomaine.rows, jours });
}
