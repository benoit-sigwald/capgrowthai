import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { exigerAdmin } from "@/lib/portee";

// Gestion des mandats — admin seulement. Le MODE_EXPEDITEUR se choisit ICI,
// a la creation : c'est une decision de structure, pas un reglage de campagne.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!exigerAdmin(p)) return res.status(403).json({ erreur: "reserve a l'administrateur" });

  if (req.method === "GET") {
    const r = await q(`SELECT c.ID, c.NOM, c.MODE_EXPEDITEUR, c.CREATED_AT,
                              (SELECT COUNT(*) FROM AFFECTATION a WHERE a.CLIENT_ID = c.ID) UTILISATEURS,
                              (SELECT COUNT(*) FROM EXPEDITEUR e WHERE e.CLIENT_ID = c.ID) EXPEDITEURS
                         FROM CLIENT c ORDER BY c.NOM`);
    return res.json({ rows: r.rows });
  }
  if (req.method === "POST") {
    const { nom, mode } = (req.body ?? {}) as { nom?: string; mode?: string };
    if (!nom?.trim()) return res.status(400).json({ erreur: "nom requis" });
    if (mode && !["mandat", "utilisateur"].includes(mode))
      return res.status(400).json({ erreur: "mode : mandat ou utilisateur" });
    await q(`MERGE INTO CLIENT c USING (SELECT :n NOM FROM DUAL) s ON (c.NOM = s.NOM)
             WHEN MATCHED THEN UPDATE SET MODE_EXPEDITEUR = NVL(:m, MODE_EXPEDITEUR)
             WHEN NOT MATCHED THEN INSERT (NOM, MODE_EXPEDITEUR)
               VALUES (:n, NVL(:m, 'mandat'))`, { n: nom.trim(), m: mode ?? null });
    return res.json({ ok: true });
  }
  res.setHeader("Allow", ["GET", "POST"]); res.status(405).end();
}
