import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { contactsAutorises } from "@/lib/portee";
import { SQL_LANGUES } from "@/lib/personnes";

// Les langues presentes dans le referentiel, avec leur effectif joignable.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const [langues, inconnues] = await Promise.all([
    q(SQL_LANGUES),
    q(`SELECT COUNT(*) N FROM V_PERSONNES
        WHERE LANGUES IS NULL AND (EMAIL IS NOT NULL OR LINKEDIN_URL IS NOT NULL)`),
  ]);
  res.json({ rows: langues.rows, inconnues: (inconnues.rows as { N: number }[])[0].N });
}
