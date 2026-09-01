import type { NextApiRequest, NextApiResponse } from "next";
import { q, qLot, oracledb } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const id = Number(req.query.id);
  const l = await q(`SELECT ID, CLIENT_ID, NOM FROM CONTACT_LISTE WHERE ID = :id`, { id });
  const liste = (l.rows as { ID: number; CLIENT_ID: number; NOM: string }[])[0];
  if (!liste || !clientAutorise(p, liste.CLIENT_ID)) return res.status(404).json({ erreur: "liste inconnue" });

  if (req.method === "GET") {
    const r = await q(`SELECT m.PERSON_KEY, m.AJOUTE_LE, v.FIRST_NAME, v.LAST_NAME, v.EMAIL, v.COMPANY, v.SOURCE
                         FROM CONTACT_LISTE_MEMBRE m
                         JOIN V_PERSONNES v ON v.PERSON_KEY = m.PERSON_KEY
                        WHERE m.LISTE_ID = :id ORDER BY v.LAST_NAME`, { id });
    return res.json({ liste, rows: r.rows });
  }
  if (req.method === "POST") {
    const { person_keys } = (req.body ?? {}) as { person_keys?: string[] };
    if (!Array.isArray(person_keys) || !person_keys.length)
      return res.status(400).json({ erreur: "person_keys requis" });
    // MERGE ligne a ligne en lot : re-ajouter un membre present est un non-evenement.
    await qLot(`MERGE INTO CONTACT_LISTE_MEMBRE m
                USING (SELECT :id LISTE_ID, :k PERSON_KEY FROM DUAL) s
                  ON (m.LISTE_ID = s.LISTE_ID AND m.PERSON_KEY = s.PERSON_KEY)
                WHEN NOT MATCHED THEN INSERT (LISTE_ID, PERSON_KEY) VALUES (:id, :k)`,
      person_keys.map(k => ({ id, k })),
      { id: { type: oracledb.NUMBER }, k: { type: oracledb.STRING, maxSize: 620 } });
    return res.json({ ok: true, ajoutes: person_keys.length });
  }
  if (req.method === "DELETE") {
    await q(`DELETE FROM CONTACT_LISTE WHERE ID = :id`, { id });
    return res.json({ ok: true });
  }
  res.setHeader("Allow", ["GET", "POST", "DELETE"]); res.status(405).end();
}
