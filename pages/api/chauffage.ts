import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise } from "@/lib/portee";
import { chauffage } from "@/lib/mailer";

// Relais du palier de chauffage — la source est le mailer, jamais un calcul
// local. On verifie seulement que l'expediteur demande est dans la portee.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  const id = Number(req.query.expediteur || 0);
  const e = (await q(`SELECT CLIENT_ID, EMAIL FROM EXPEDITEUR WHERE ID = :id`, { id }))
    .rows as { CLIENT_ID: number; EMAIL: string }[];
  if (!e.length || !clientAutorise(p, e[0].CLIENT_ID))
    return res.status(404).json({ erreur: "expediteur inconnu" });
  res.json(await chauffage(e[0].EMAIL));
}
