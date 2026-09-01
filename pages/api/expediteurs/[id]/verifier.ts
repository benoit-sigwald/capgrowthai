import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise } from "@/lib/portee";
import { verifierExpediteur } from "@/lib/expediteurs";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (req.method !== "POST") { res.setHeader("Allow", ["POST"]); return res.status(405).end(); }
  const id = Number(req.query.id);
  const e = (await q(`SELECT CLIENT_ID FROM EXPEDITEUR WHERE ID = :id`, { id }))
    .rows as { CLIENT_ID: number }[];
  if (!e.length || !clientAutorise(p, e[0].CLIENT_ID))
    return res.status(404).json({ erreur: "expediteur inconnu" });
  const verdict = await verifierExpediteur(id);
  res.json(verdict);
}
