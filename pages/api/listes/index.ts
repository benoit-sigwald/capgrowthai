import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";

// Une liste statique est un ensemble FIGE : on y met des personnes, elles y
// restent. L'oppose exact du segment — les deux existent, comme chez Brevo.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  if (req.method === "GET") {
    const r = await q(`SELECT l.ID, l.NOM, l.NOTES, l.CREATED_AT,
                              (SELECT COUNT(*) FROM CONTACT_LISTE_MEMBRE m WHERE m.LISTE_ID = l.ID) MEMBRES
                         FROM CONTACT_LISTE l WHERE l.CLIENT_ID = :cid ORDER BY l.CREATED_AT DESC`, { cid });
    return res.json({ rows: r.rows });
  }
  if (req.method === "POST") {
    const { nom, notes } = (req.body ?? {}) as { nom?: string; notes?: string };
    if (!nom) return res.status(400).json({ erreur: "nom requis" });
    await q(`MERGE INTO CONTACT_LISTE l USING (SELECT :cid CID, :nom NOM FROM DUAL) s
               ON (l.CLIENT_ID = s.CID AND l.NOM = s.NOM)
             WHEN NOT MATCHED THEN INSERT (CLIENT_ID, NOM, NOTES) VALUES (:cid, :nom, :notes)`,
            { cid, nom, notes: notes ?? null });
    return res.json({ ok: true });
  }
  res.setHeader("Allow", ["GET", "POST"]); res.status(405).end();
}
