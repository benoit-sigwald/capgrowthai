import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { exigerAdmin } from "@/lib/portee";

type Affectation = { client_id: number; role: string };

/*
 * Comptes — admin seulement. Le mot de passe initial est genere ici, montre
 * UNE fois dans la reponse, et jamais stocke en clair nulle part.
 *
 * Le role se donne MANDAT PAR MANDAT (AFFECTATION.ROLE) : « membre » travaille
 * le referentiel, « client » ne voit que son propre mandat. UTILISATEUR.ROLE
 * ne dit plus qu'une chose : administrateur, ou non.
 */
async function ecrireAffectations(uid: number, aff: Affectation[]) {
  await q(`DELETE FROM AFFECTATION WHERE UTILISATEUR_ID = :id`, { id: uid });
  for (const a of aff) {
    const role = ["membre", "client"].includes(a.role) ? a.role : "membre";
    await q(`INSERT INTO AFFECTATION (UTILISATEUR_ID, CLIENT_ID, ROLE)
             VALUES (:u, :c, :r)`, { u: uid, c: Number(a.client_id), r: role });
  }
}

/* Accepte l'ancienne forme (client_ids) comme la nouvelle (affectations). */
function lireAffectations(b: { affectations?: Affectation[]; client_ids?: number[] }): Affectation[] {
  if (Array.isArray(b.affectations))
    return b.affectations.filter(a => Number(a?.client_id));
  return (b.client_ids ?? []).map(c => ({ client_id: Number(c), role: "membre" }));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!exigerAdmin(p)) return res.status(403).json({ erreur: "reserve a l'administrateur" });
  const b = (req.body ?? {}) as {
    id?: number; email?: string; nom?: string; role?: string; actif?: number;
    affectations?: Affectation[]; client_ids?: number[]; reinitialiser?: boolean;
  };

  if (req.method === "GET") {
    const r = await q(`SELECT u.ID, u.EMAIL, u.NOM, u.ROLE, u.ACTIF,
                              (SELECT LISTAGG(c.NOM || ' (' || a.ROLE || ')', ', ')
                                        WITHIN GROUP (ORDER BY c.NOM)
                                 FROM AFFECTATION a JOIN CLIENT c ON c.ID = a.CLIENT_ID
                                WHERE a.UTILISATEUR_ID = u.ID) MANDATS
                         FROM UTILISATEUR u ORDER BY u.EMAIL`);
    const a = await q(`SELECT UTILISATEUR_ID, CLIENT_ID, ROLE FROM AFFECTATION`);
    return res.json({ rows: r.rows, affectations: a.rows });
  }

  if (req.method === "POST") {
    const adresse = b.email?.trim().toLowerCase();
    if (!adresse || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(adresse))
      return res.status(400).json({ erreur: "email valide requis" });
    if (!["admin", "membre", "client"].includes(b.role ?? ""))
      return res.status(400).json({ erreur: "role : admin, membre ou client" });

    const motdepasse = randomBytes(12).toString("base64url");
    const hash = bcrypt.hashSync(motdepasse, 10);
    await q(`MERGE INTO UTILISATEUR u USING (SELECT :e EMAIL FROM DUAL) s
               ON (LOWER(u.EMAIL) = LOWER(s.EMAIL))
             WHEN MATCHED THEN UPDATE SET NOM = NVL(:n, NOM), ROLE = :r, HASH = :h, ACTIF = 1
             WHEN NOT MATCHED THEN INSERT (EMAIL, NOM, ROLE, HASH)
               VALUES (:e, :n, :r, :h)`,
            { e: adresse, n: b.nom?.trim() ?? null, r: b.role, h: hash });
    const u = (await q(`SELECT ID FROM UTILISATEUR WHERE LOWER(EMAIL) = LOWER(:e)`,
                       { e: adresse })).rows as { ID: number }[];
    await ecrireAffectations(u[0].ID, lireAffectations(b));
    // Le mot de passe part une fois dans la reponse : a transmettre par un
    // canal sur, puis a changer. Il n'existe nulle part ailleurs.
    return res.json({ ok: true, id: u[0].ID, motdepasse_initial: motdepasse });
  }

  if (req.method === "PATCH") {
    const id = Number(b.id);
    if (!id) return res.status(400).json({ erreur: "id requis" });
    if (b.role && !["admin", "membre", "client"].includes(b.role))
      return res.status(400).json({ erreur: "role : admin, membre ou client" });

    /*
     * Un admin qui se retire a lui-meme le dernier acces admin verrouillerait
     * l'outil pour tout le monde, sans moyen de revenir en arriere.
     */
    if ((b.role && b.role !== "admin") || b.actif === 0) {
      const n = (await q(`SELECT COUNT(*) N FROM UTILISATEUR
                           WHERE ROLE = 'admin' AND ACTIF = 1 AND ID <> :id`, { id }))
                .rows as { N: number }[];
      const cible = (await q(`SELECT ROLE, ACTIF FROM UTILISATEUR WHERE ID = :id`, { id }))
                    .rows as { ROLE: string; ACTIF: number }[];
      if (cible[0]?.ROLE === "admin" && cible[0]?.ACTIF === 1 && n[0].N === 0)
        return res.status(409).json({ erreur: "dernier administrateur actif : impossible de le retirer" });
    }

    await q(`UPDATE UTILISATEUR SET NOM = NVL(:n, NOM), ROLE = NVL(:r, ROLE),
                                    ACTIF = NVL(:a, ACTIF) WHERE ID = :id`,
            { n: b.nom?.trim() || null, r: b.role ?? null,
              a: b.actif === undefined ? null : Number(b.actif), id });
    if (b.affectations || b.client_ids) await ecrireAffectations(id, lireAffectations(b));

    let motdepasse: string | undefined;
    if (b.reinitialiser) {
      motdepasse = randomBytes(12).toString("base64url");
      await q(`UPDATE UTILISATEUR SET HASH = :h WHERE ID = :id`,
              { h: bcrypt.hashSync(motdepasse, 10), id });
    }
    return res.json({ ok: true, motdepasse_initial: motdepasse });
  }

  if (req.method === "DELETE") {
    const id = Number(b.id || req.query.id);
    if (!id) return res.status(400).json({ erreur: "id requis" });
    const n = (await q(`SELECT COUNT(*) N FROM UTILISATEUR
                         WHERE ROLE = 'admin' AND ACTIF = 1 AND ID <> :id`, { id }))
              .rows as { N: number }[];
    const cible = (await q(`SELECT ROLE, ACTIF FROM UTILISATEUR WHERE ID = :id`, { id }))
                  .rows as { ROLE: string; ACTIF: number }[];
    if (!cible.length) return res.status(404).json({ erreur: "compte introuvable" });
    if (cible[0].ROLE === "admin" && cible[0].ACTIF === 1 && n[0].N === 0)
      return res.status(409).json({ erreur: "dernier administrateur actif : suppression refusee" });

    /*
     * Un compte qui porte une adresse d'expedition ne s'efface pas : cette
     * adresse a une reputation et un historique d'envois. On desactive.
     */
    const exp = (await q(`SELECT COUNT(*) N FROM EXPEDITEUR WHERE UTILISATEUR_ID = :id`, { id }))
                .rows as { N: number }[];
    if (exp[0].N) {
      await q(`UPDATE UTILISATEUR SET ACTIF = 0 WHERE ID = :id`, { id });
      return res.json({ ok: true, desactive: true,
        message: `Compte désactivé plutôt que supprimé : ${exp[0].N} adresse(s) d'expédition lui appartiennent.` });
    }
    await q(`DELETE FROM AFFECTATION WHERE UTILISATEUR_ID = :id`, { id });
    await q(`DELETE FROM UTILISATEUR WHERE ID = :id`, { id });
    return res.json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]); res.status(405).end();
}
