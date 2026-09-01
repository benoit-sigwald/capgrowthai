import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { contactsAutorises } from "@/lib/portee";

// Les gabarits actifs du mailer, en lecture : la campagne choisit par langue
// automatiquement, l'ecran ne fait que montrer ce qui partira.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const r = await q(`SELECT TEMPLATE_ID, NAME, LANGUAGE, SUBJECT, VERSION
                       FROM INVESTORS.MAILING_TEMPLATES
                      WHERE IS_ACTIVE = 1 AND CHANNEL = 'email' ORDER BY LANGUAGE`);
  res.json({ rows: r.rows });
}
