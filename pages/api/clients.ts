import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { exigerAdmin } from "@/lib/portee";

/*
 * Gestion des mandats — admin seulement.
 *
 * Le MODE_EXPEDITEUR se choisit ici : c'est une decision de structure
 * (adresses communes, ou chacun sous la sienne), pas un reglage de campagne.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!exigerAdmin(p)) return res.status(403).json({ erreur: "reserve a l'administrateur" });
  const v = (req.body ?? {}) as { id?: number; nom?: string; mode?: string };

  if (req.method === "GET") {
    const r = await q(`SELECT c.ID, c.NOM, c.MODE_EXPEDITEUR, c.CREATED_AT,
                              (SELECT COUNT(*) FROM AFFECTATION a WHERE a.CLIENT_ID = c.ID) UTILISATEURS,
                              (SELECT COUNT(*) FROM EXPEDITEUR e WHERE e.CLIENT_ID = c.ID) EXPEDITEURS,
                              (SELECT COUNT(*) FROM LISTE l WHERE l.CLIENT_ID = c.ID) SEGMENTS,
                              (SELECT COUNT(*) FROM CONTACT_LISTE k WHERE k.CLIENT_ID = c.ID) LISTES,
                              (SELECT COUNT(*) FROM CONTACT_STATE s WHERE s.CLIENT_ID = c.ID) ETATS,
                              (SELECT COUNT(*) FROM INVESTORS.MAILING_CAMPAIGNS m
                                WHERE m.CLIENT_ID = c.ID) CAMPAGNES
                         FROM CLIENT c ORDER BY c.NOM`);
    return res.json({ rows: r.rows });
  }

  if (req.method === "POST") {
    if (!v.nom?.trim()) return res.status(400).json({ erreur: "nom requis" });
    if (v.mode && !["mandat", "utilisateur"].includes(v.mode))
      return res.status(400).json({ erreur: "mode : mandat ou utilisateur" });
    try {
      if (v.id) {
        // Renommage / changement de mode d'un mandat existant. Un UPDATE qui ne
        // touche aucune ligne n'est pas une reussite : il faut le dire.
        const r = await q(`UPDATE CLIENT SET NOM = :n, MODE_EXPEDITEUR = NVL(:m, MODE_EXPEDITEUR)
                            WHERE ID = :id`, { n: v.nom.trim(), m: v.mode ?? null, id: v.id });
        if (!r.rowsAffected) return res.status(404).json({ erreur: "mandat introuvable" });
      } else {
        await q(`INSERT INTO CLIENT (NOM, MODE_EXPEDITEUR) VALUES (:n, NVL(:m, 'mandat'))`,
                { n: v.nom.trim(), m: v.mode ?? null });
      }
    } catch (e) {
      if (String((e as Error).message).includes("UQ_CLIENT_NOM"))
        return res.status(409).json({ erreur: "un mandat porte deja ce nom" });
      throw e;
    }
    return res.json({ ok: true });
  }

  if (req.method === "DELETE") {
    const id = Number(v.id || req.query.id);
    if (!id) return res.status(400).json({ erreur: "id requis" });

    /*
     * Un mandat qui a servi ne se supprime pas.
     *
     * Ses campagnes sont une piece comptable et ses etats commerciaux
     * l'historique d'une relation : les effacer d'un clic parce qu'une ligne
     * gene dans une liste serait une perte irreversible. On dit ce qui bloque
     * plutot que de le faire quand meme.
     */
    const usage = await q(`SELECT
        (SELECT COUNT(*) FROM INVESTORS.MAILING_CAMPAIGNS m WHERE m.CLIENT_ID = :id) CAMPAGNES,
        (SELECT COUNT(*) FROM CONTACT_STATE s WHERE s.CLIENT_ID = :id) ETATS,
        (SELECT COUNT(*) FROM INTERACTION i WHERE i.CLIENT_ID = :id) INTERACTIONS,
        -- PROSPECTS.CAMPAGNE precede MAILING_CAMPAIGNS et ne porte aucune cle
        -- etrangere vers CLIENT : sans ce comptage, ses lignes deviendraient
        -- orphelines sans que rien ne proteste.
        (SELECT COUNT(*) FROM CAMPAGNE g WHERE g.CLIENT_ID = :id) CAMPAGNES_ANCIENNES
        FROM DUAL`, { id });
    const u = (usage.rows as { CAMPAGNES: number; ETATS: number;
                               INTERACTIONS: number; CAMPAGNES_ANCIENNES: number }[])[0];
    const campagnes = u.CAMPAGNES + u.CAMPAGNES_ANCIENNES;
    if (campagnes || u.ETATS || u.INTERACTIONS)
      return res.status(409).json({
        erreur: `mandat utilisé : ${campagnes} campagne(s), ${u.ETATS} état(s), ` +
                `${u.INTERACTIONS} interaction(s). Un historique ne s'efface pas d'un clic.` });

    // Ce qui n'est que de la configuration part avec lui.
    await q(`DELETE FROM CONTACT_LISTE WHERE CLIENT_ID = :id`, { id });
    await q(`DELETE FROM LISTE WHERE CLIENT_ID = :id`, { id });
    await q(`DELETE FROM ATTRIBUT_LIBRE WHERE CLIENT_ID = :id`, { id });
    await q(`DELETE FROM AUTOMATISATION WHERE CLIENT_ID = :id`, { id });
    await q(`DELETE FROM EXPEDITEUR WHERE CLIENT_ID = :id`, { id });
    await q(`DELETE FROM AFFECTATION WHERE CLIENT_ID = :id`, { id });
    await q(`DELETE FROM CLIENT WHERE ID = :id`, { id });
    return res.json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]); res.status(405).end();
}
