import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { ciblesDeLaListe, ciblesDuSegment } from "@/lib/cibles";
import { preparer, RefusMailer } from "@/lib/mailer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  if (req.method === "GET") {
    const r = await q(`
      SELECT c.CAMPAIGN_ID, c.NAME, c.CREATED_AT, c.TOTAL_TARGETED,
             c.EXPEDITEUR_EMAIL, c.EXPEDITEUR_NOM,
             COUNT(CASE WHEN s.SENT_AT IS NOT NULL THEN 1 END) ENVOYES,
             COUNT(CASE WHEN s.STATUS = 'pending' THEN 1 END) EN_ATTENTE,
             COUNT(CASE WHEN s.OPENED_AT IS NOT NULL THEN 1 END) OUVERTS,
             COUNT(CASE WHEN s.CLICKED_AT IS NOT NULL THEN 1 END) CLIQUES,
             COUNT(CASE WHEN s.REPLIED_AT IS NOT NULL THEN 1 END) REPONDUS,
             COUNT(CASE WHEN s.BOUNCED_AT IS NOT NULL THEN 1 END) REBONDS
        FROM INVESTORS.MAILING_CAMPAIGNS c
        LEFT JOIN INVESTORS.MAILING_SENDS s ON s.CAMPAIGN_ID = c.CAMPAIGN_ID
       WHERE c.CLIENT_ID = :cid
       GROUP BY c.CAMPAIGN_ID, c.NAME, c.CREATED_AT, c.TOTAL_TARGETED,
                c.EXPEDITEUR_EMAIL, c.EXPEDITEUR_NOM
       ORDER BY c.CREATED_AT DESC`, { cid });
    return res.json({ rows: r.rows });
  }

  if (req.method === "POST") {
    // Le ciblage est le referentiel : reserve aux roles Arx.
    if (!contactsAutorises(p)) return res.status(403).json({ erreur: "creation reservee a Arx" });
    const { nom, segment_id, liste_id, expediteur_id, limite, template_ids } =
      (req.body ?? {}) as { nom?: string; segment_id?: number; liste_id?: number;
        expediteur_id?: number; limite?: number; template_ids?: string[] };
    if (!nom?.trim() || !expediteur_id || (!segment_id && !liste_id))
      return res.status(400).json({ erreur: "nom, expediteur_id et un segment OU une liste requis" });
    if (segment_id && liste_id)
      return res.status(400).json({ erreur: "un segment ou une liste, pas les deux" });

    // L'expediteur doit appartenir au mandat, etre verifie, et — en mode
    // « utilisateur » — etre le sien. Un domaine non authentifie ne part pas :
    // chaque envoi echouerait SPF et brulerait le domaine.
    const exp = (await q(`SELECT e.ID, e.EMAIL, e.NOM_AFFICHAGE, e.UTILISATEUR_ID,
                                 e.SPF_OK, e.DKIM_OK, c.MODE_EXPEDITEUR
                            FROM EXPEDITEUR e JOIN CLIENT c ON c.ID = e.CLIENT_ID
                           WHERE e.ID = :id AND e.CLIENT_ID = :cid`,
                         { id: expediteur_id, cid })).rows as {
      ID: number; EMAIL: string; NOM_AFFICHAGE: string; UTILISATEUR_ID: number | null;
      SPF_OK: number; DKIM_OK: number; MODE_EXPEDITEUR: string }[];
    if (!exp.length) return res.status(404).json({ erreur: "expediteur inconnu sur ce mandat" });
    const e = exp[0];
    if (!e.SPF_OK || !e.DKIM_OK)
      return res.status(422).json({ erreur: `domaine non authentifie (SPF ${e.SPF_OK ? "ok" : "manquant"}, DKIM ${e.DKIM_OK ? "ok" : "manquant"}) : verifier l'expediteur avant d'envoyer` });
    if (e.MODE_EXPEDITEUR === "utilisateur" && p.role !== "admin" && e.UTILISATEUR_ID !== p.uid)
      return res.status(403).json({ erreur: "ce mandat impose d'envoyer sous sa propre adresse" });

    // La source appartient au mandat. Un segment rejoue son filtre maintenant ;
    // une liste rend ce qu'on y a mis, et rien d'autre.
    const cibles = segment_id
      ? await ciblesDuSegment(Number(segment_id), cid, limite)
      : await ciblesDeLaListe(Number(liste_id), cid, limite);
    if (!cibles) return res.status(404).json({
      erreur: `${segment_id ? "segment" : "liste"} inconnu sur ce mandat` });
    if (!cibles.nombre) return res.status(422).json({ erreur: "segment vide cote investisseurs" });

    let prep;
    try {
      prep = await preparer({
      name: nom.trim(), csv: cibles.csv,
      client_id: cid, sender_email: e.EMAIL, sender_name: e.NOM_AFFICHAGE,
      // Gabarits imposes : sans cela, deux gabarits actifs de meme langue se
      // departagent tout seuls et l'expediteur ignore lequel part.
        template_ids: Array.isArray(template_ids) ? template_ids : undefined,
      });
    } catch (e) {
      // Un refus du routeur (gabarit absent, quota) est une reponse metier.
      if (e instanceof RefusMailer) return res.status(422).json({ erreur: e.message });
      throw e;
    }
    return res.json({ ok: true, ...prep,
      hors_investisseurs: cibles.horsInvestisseurs });
  }

  res.setHeader("Allow", ["GET", "POST"]); res.status(405).end();
}
