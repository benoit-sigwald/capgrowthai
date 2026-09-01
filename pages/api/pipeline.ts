import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { SQL_PIPELINE, COLONNES_PIPELINE } from "@/lib/crm";

/*
 * Le pipeline d'un mandat : une colonne par statut, les fiches dedans.
 *
 * « a_contacter » n'est pas une colonne — ce sont les 3 879 personnes de la
 * reserve. Les afficher noierait les quelques dizaines sur lesquelles on
 * travaille vraiment. Leur compte est rendu a part.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });
  res.setHeader("Cache-Control", "no-store");

  const mien = req.query.mien === "1";
  const filtre = mien ? `AND PROPRIETAIRE = :prop` : ``;
  const binds: Record<string, unknown> = { cid, ...(mien ? { prop: String(p.uid) } : {}) };

  const [fiches, reserve] = await Promise.all([
    // 200 par colonne : au-dela, un pipeline ne se lit plus, il se filtre.
    q(`SELECT * FROM (${SQL_PIPELINE})
        WHERE STATUT IN (${COLONNES_PIPELINE.map(s => `'${s}'`).join(", ")}) ${filtre}
        ORDER BY ACTION_LE NULLS LAST, LAST_NAME
        FETCH FIRST 400 ROWS ONLY`, binds),
    q(`SELECT COUNT(*) N FROM (${SQL_PIPELINE})
        WHERE STATUT = 'a_contacter' AND OPT_OUT = 0
          AND (EMAIL IS NOT NULL OR LINKEDIN_URL IS NOT NULL)`, { cid }),
  ]);

  const colonnes: Record<string, unknown[]> = {};
  COLONNES_PIPELINE.forEach(s => { colonnes[s] = []; });
  for (const f of fiches.rows as { STATUT: string }[]) colonnes[f.STATUT]?.push(f);

  res.json({ colonnes, reserve: (reserve.rows as { N: number }[])[0].N });
}
