import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  const sql = p.role === "admin"
    ? `SELECT ID, NOM, MODE_EXPEDITEUR FROM CLIENT ORDER BY NOM`
    : `SELECT c.ID, c.NOM, c.MODE_EXPEDITEUR FROM CLIENT c
        JOIN AFFECTATION a ON a.CLIENT_ID = c.ID AND a.UTILISATEUR_ID = :u
        ORDER BY c.NOM`;
  const r = await q(sql, p.role === "admin" ? {} : { u: p.uid });
  res.json({ role: p.role, mandats: r.rows });
}
