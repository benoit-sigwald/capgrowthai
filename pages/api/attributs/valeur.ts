import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  if (req.method !== "POST") { res.setHeader("Allow", ["POST"]); return res.status(405).end(); }
  const { attribut_id, person_key, valeur } = (req.body ?? {}) as
    { attribut_id?: number; person_key?: string; valeur?: string };
  if (!attribut_id || !person_key) return res.status(400).json({ erreur: "attribut_id et person_key requis" });
  const a = await q(`SELECT CLIENT_ID FROM ATTRIBUT_LIBRE WHERE ID = :id`, { id: attribut_id });
  const cid = (a.rows as { CLIENT_ID: number }[])[0]?.CLIENT_ID;
  if (!cid || !clientAutorise(p, cid)) return res.status(404).json({ erreur: "attribut inconnu" });
  await q(`MERGE INTO ATTRIBUT_VALEUR v USING (SELECT :aid AID, :k K FROM DUAL) s
             ON (v.ATTRIBUT_ID = s.AID AND v.PERSON_KEY = s.K)
           WHEN MATCHED THEN UPDATE SET VALEUR = :val, MAJ_LE = SYSTIMESTAMP
           WHEN NOT MATCHED THEN INSERT (ATTRIBUT_ID, PERSON_KEY, VALEUR)
             VALUES (:aid, :k, :val)`,
        { aid: attribut_id, k: person_key, val: valeur ?? null });
  res.json({ ok: true });
}
