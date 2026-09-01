import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { construireFiltre } from "@/lib/personnes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const id = Number(req.query.id);
  const seg = await q(`SELECT ID, CLIENT_ID, NOM, FILTRE FROM LISTE WHERE ID = :id`, { id });
  const s = (seg.rows as { ID: number; CLIENT_ID: number; NOM: string; FILTRE: string }[])[0];
  // Le 404 vaut aussi pour « pas votre mandat » : ne pas confirmer l'existence.
  if (!s || !clientAutorise(p, s.CLIENT_ID)) return res.status(404).json({ erreur: "segment inconnu" });

  if (req.method === "GET") {
    const { where, binds } = construireFiltre(JSON.parse(s.FILTRE));
    const rows = await q(`SELECT PERSON_KEY, SOURCE, FIRST_NAME, LAST_NAME, EMAIL, COMPANY
                            FROM V_PERSONNES WHERE ${where}
                           ORDER BY LAST_NAME FETCH FIRST 60 ROWS ONLY`, binds);
    const c = await q(`SELECT COUNT(*) N FROM V_PERSONNES WHERE ${where}`, binds);
    return res.json({ segment: { ...s, FILTRE: JSON.parse(s.FILTRE) },
                      total: (c.rows as { N: number }[])[0].N, rows: rows.rows });
  }
  if (req.method === "DELETE") {
    await q(`DELETE FROM LISTE WHERE ID = :id`, { id });
    return res.json({ ok: true });
  }
  res.setHeader("Allow", ["GET", "DELETE"]); res.status(405).end();
}
