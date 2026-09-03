import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { contactsAutorises } from "@/lib/portee";
import { FAMILLES, familleDe } from "@/lib/personnes";

/*
 * Ce qu'on peut cocher, et combien chaque case represente.
 *
 * Un filtre sans compteur oblige a essayer pour savoir : on coche, on regarde,
 * on decoche. Le nombre dit d'avance si la case vaut la peine — et il vient de
 * la base, pas d'une estimation.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });

  const champ = String(req.query.champ || "");

  if (champ === "pays") {
    const r = await q(`SELECT COUNTRY VALEUR, COUNT(*) N FROM V_PERSONNES
                        WHERE COUNTRY IS NOT NULL GROUP BY COUNTRY ORDER BY N DESC`);
    return res.json({ rows: r.rows });
  }

  if (champ === "secteur") {
    const r = await q(`SELECT SECTEUR VALEUR, COUNT(*) N FROM V_PERSONNES
                        WHERE SECTEUR IS NOT NULL GROUP BY SECTEUR ORDER BY N DESC`);
    const brut = r.rows as { VALEUR: string; N: number }[];

    /*
     * Les familles d'abord, avec la somme de leurs etiquettes : c'est ce qu'on
     * veut cocher. Le reste ensuite — 195 valeurs distinctes existent, dont
     * toute la nomenclature d'activite des prospects PACA, et elle doit rester
     * atteignable sans qu'on la range de force dans une famille.
     */
    const familles = FAMILLES.map(f => ({
      id: f.id, libelle: f.libelle,
      n: brut.filter(b => f.variantes.includes(b.VALEUR)).reduce((s, b) => s + b.N, 0),
    })).filter(f => f.n > 0);

    const autres = brut.filter(b => !familleDe(b.VALEUR))
      .map(b => ({ id: b.VALEUR, libelle: b.VALEUR, n: b.N }));

    return res.json({ familles, autres });
  }

  res.status(400).json({ erreur: "champ : pays ou secteur" });
}
