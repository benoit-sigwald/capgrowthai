import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { construireFiltre } from "@/lib/personnes";

/*
 * Un segment est un filtre enregistre, rejoue a chaque usage — jamais des
 * lignes. Sur un referentiel qui bouge tous les jours, une photo se perime ;
 * un critere rend l'etat du jour. (Table LISTE existante, desormais par mandat.)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  if (req.method === "GET") {
    const r = await q(`SELECT ID, NOM, FILTRE, CANAL, DERNIER_ENVOI, LIGNES_ENVOYEES, UPDATED_AT
                         FROM LISTE WHERE CLIENT_ID = :cid ORDER BY UPDATED_AT DESC`, { cid });
    return res.json({ rows: (r.rows as { FILTRE: string }[]).map(l => ({ ...l, FILTRE: JSON.parse(l.FILTRE) })) });
  }
  if (req.method === "POST") {
    const { nom, filtre } = (req.body ?? {}) as { nom?: string; filtre?: Record<string, string> };
    if (!nom) return res.status(400).json({ erreur: "nom requis" });
    construireFiltre(filtre ?? {}); // valide les cles avant d'enregistrer
    await q(`MERGE INTO LISTE l USING (SELECT :cid CID, :nom NOM FROM DUAL) s
               ON (l.CLIENT_ID = s.CID AND l.NOM = s.NOM)
             WHEN MATCHED THEN UPDATE SET FILTRE = :f, UPDATED_AT = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT (CLIENT_ID, NOM, FILTRE, CANAL, CREE_PAR)
               VALUES (:cid, :nom, :f, 'mixte', :qui)`,
            { cid, nom, f: JSON.stringify(filtre ?? {}), qui: `uid:${p.uid}` });
    return res.json({ ok: true });
  }
  res.setHeader("Allow", ["GET", "POST"]); res.status(405).end();
}
