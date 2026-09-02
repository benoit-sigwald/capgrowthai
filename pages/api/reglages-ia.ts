import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";

/*
 * Reglages de redaction assistee, par mandat.
 *
 * Le ton d'une reponse est la voix du mandat, pas une preference personnelle :
 * deux personnes qui repondent aux memes investisseurs doivent ecrire de la
 * meme facon. D'ou une ligne par mandat, et non un reglage par navigateur.
 */
export const DEFAUTS = {
  TON: "formel", LONGUEUR: "bref", APPEL: null as string | null,
  CONGE: null as string | null, SIGNATURE: null as string | null,
  LANGUE: "auto", CONTEXTE: null as string | null,
};

export async function reglagesDuMandat(cid: number) {
  const r = await q(`SELECT TON, LONGUEUR, APPEL, CONGE, SIGNATURE, LANGUE, CONTEXTE
                       FROM REGLAGE_IA WHERE CLIENT_ID = :cid`, { cid });
  return (r.rows as (typeof DEFAUTS)[])[0] ?? DEFAUTS;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  if (req.method === "GET") return res.json({ reglages: await reglagesDuMandat(cid) });

  if (req.method === "POST") {
    const v = (req.body ?? {}) as Record<string, string | undefined>;
    if (v.ton && !["formel", "cordial", "direct"].includes(v.ton))
      return res.status(400).json({ erreur: "ton : formel, cordial ou direct" });
    if (v.longueur && !["bref", "standard", "detaille"].includes(v.longueur))
      return res.status(400).json({ erreur: "longueur : bref, standard ou detaille" });

    await q(`MERGE INTO REGLAGE_IA r USING (SELECT :cid CLIENT_ID FROM DUAL) s
               ON (r.CLIENT_ID = s.CLIENT_ID)
             WHEN MATCHED THEN UPDATE SET TON = :ton, LONGUEUR = :lg, APPEL = :appel,
                    CONGE = :conge, SIGNATURE = :sig, LANGUE = :langue,
                    CONTEXTE = :ctx, UPDATED_AT = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT (CLIENT_ID, TON, LONGUEUR, APPEL, CONGE,
                    SIGNATURE, LANGUE, CONTEXTE)
               VALUES (:cid, :ton, :lg, :appel, :conge, :sig, :langue, :ctx)`,
            { cid, ton: v.ton || "formel", lg: v.longueur || "bref",
              appel: v.appel?.slice(0, 120) || null, conge: v.conge?.slice(0, 160) || null,
              sig: v.signature?.slice(0, 200) || null, langue: v.langue || "auto",
              ctx: v.contexte?.slice(0, 2000) || null });
    return res.json({ ok: true, reglages: await reglagesDuMandat(cid) });
  }

  res.setHeader("Allow", ["GET", "POST"]); res.status(405).end();
}
