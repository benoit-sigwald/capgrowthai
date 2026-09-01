import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { exigerAdmin } from "@/lib/portee";

/*
 * Comptes — admin seulement. Le mot de passe initial est genere ici, montre
 * UNE fois dans la reponse, et jamais stocke en clair nulle part.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!exigerAdmin(p)) return res.status(403).json({ erreur: "reserve a l'administrateur" });

  if (req.method === "GET") {
    const r = await q(`SELECT u.ID, u.EMAIL, u.NOM, u.ROLE, u.ACTIF,
                              (SELECT LISTAGG(c.NOM, ', ') WITHIN GROUP (ORDER BY c.NOM)
                                 FROM AFFECTATION a JOIN CLIENT c ON c.ID = a.CLIENT_ID
                                WHERE a.UTILISATEUR_ID = u.ID) MANDATS
                         FROM UTILISATEUR u ORDER BY u.EMAIL`);
    return res.json({ rows: r.rows });
  }
  if (req.method === "POST") {
    const { email, nom, role, client_ids } = (req.body ?? {}) as
      { email?: string; nom?: string; role?: string; client_ids?: number[] };
    const adresse = email?.trim().toLowerCase();
    if (!adresse || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(adresse))
      return res.status(400).json({ erreur: "email valide requis" });
    if (!["admin", "membre", "client"].includes(role ?? ""))
      return res.status(400).json({ erreur: "role : admin, membre ou client" });

    const motdepasse = randomBytes(12).toString("base64url");
    const hash = bcrypt.hashSync(motdepasse, 10);
    await q(`MERGE INTO UTILISATEUR u USING (SELECT :e EMAIL FROM DUAL) s
               ON (LOWER(u.EMAIL) = LOWER(s.EMAIL))
             WHEN MATCHED THEN UPDATE SET NOM = NVL(:n, NOM), ROLE = :r, HASH = :h, ACTIF = 1
             WHEN NOT MATCHED THEN INSERT (EMAIL, NOM, ROLE, HASH)
               VALUES (:e, :n, :r, :h)`,
            { e: adresse, n: nom?.trim() ?? null, r: role, h: hash });
    const u = (await q(`SELECT ID FROM UTILISATEUR WHERE LOWER(EMAIL) = LOWER(:e)`,
                       { e: adresse })).rows as { ID: number }[];
    await q(`DELETE FROM AFFECTATION WHERE UTILISATEUR_ID = :id`, { id: u[0].ID });
    for (const cid of client_ids ?? []) {
      await q(`INSERT INTO AFFECTATION (UTILISATEUR_ID, CLIENT_ID) VALUES (:u, :c)`,
              { u: u[0].ID, c: Number(cid) });
    }
    // Le mot de passe part une fois dans la reponse : a transmettre par un
    // canal sur, puis a changer. Il n'existe nulle part ailleurs.
    return res.json({ ok: true, id: u[0].ID, motdepasse_initial: motdepasse });
  }
  res.setHeader("Allow", ["GET", "POST"]); res.status(405).end();
}
