import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { contactsAutorises } from "@/lib/portee";

// Lecture seule : la liste de ceux a qui on n'ecrit plus, toutes sources
// confondues (drapeau de la vue + etat commercial).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const r = await q(`SELECT v.PERSON_KEY, v.SOURCE, v.FIRST_NAME, v.LAST_NAME, v.EMAIL, v.COMPANY
                       FROM V_PERSONNES v
                       LEFT JOIN CONTACT_STATE e ON e.PERSON_KEY = v.PERSON_KEY
                      WHERE v.OPT_OUT = 1 OR NVL(e.OPT_OUT, 0) = 1
                      ORDER BY v.LAST_NAME FETCH FIRST 500 ROWS ONLY`);
  res.json({ total: r.rows?.length ?? 0, rows: r.rows });
}
