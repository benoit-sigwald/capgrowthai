import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";

/*
 * Les attributs du referentiel sont les colonnes de V_PERSONNES — figes.
 * Ici on ne gere que les champs LIBRES d'un mandat. Interdire de doublonner
 * une colonne du referentiel evite deux verites pour la meme donnee.
 */
const RESERVES = ["prenom", "nom", "titre", "societe", "email", "telephone",
  "linkedin", "ville", "pays", "notes", "source", "territoire", "secteur"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  if (req.method === "GET") {
    const r = await q(`SELECT ID, NOM, TYPE FROM ATTRIBUT_LIBRE WHERE CLIENT_ID = :cid ORDER BY NOM`, { cid });
    return res.json({ rows: r.rows });
  }
  if (req.method === "POST") {
    const { nom, type } = (req.body ?? {}) as { nom?: string; type?: string };
    if (!nom) return res.status(400).json({ erreur: "nom requis" });
    if (RESERVES.includes(nom.toLowerCase()))
      return res.status(409).json({ erreur: `ce nom existe deja dans le referentiel` });
    await q(`MERGE INTO ATTRIBUT_LIBRE a USING (SELECT :cid CID, :nom NOM FROM DUAL) s
               ON (a.CLIENT_ID = s.CID AND a.NOM = s.NOM)
             WHEN NOT MATCHED THEN INSERT (CLIENT_ID, NOM, TYPE)
               VALUES (:cid, :nom, NVL(:t, 'texte'))`, { cid, nom, t: type ?? null });
    return res.json({ ok: true });
  }
  if (req.method === "DELETE") {
    const aid = Number((req.body as { id?: number })?.id);
    await q(`DELETE FROM ATTRIBUT_LIBRE WHERE ID = :aid AND CLIENT_ID = :cid`, { aid, cid });
    return res.json({ ok: true });
  }
  res.setHeader("Allow", ["GET", "POST", "DELETE"]); res.status(405).end();
}
