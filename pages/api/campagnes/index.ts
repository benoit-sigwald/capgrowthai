import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { construireFiltre } from "@/lib/personnes";
import { preparer } from "@/lib/mailer";

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
    const { nom, segment_id, expediteur_id, limite } = (req.body ?? {}) as
      { nom?: string; segment_id?: number; expediteur_id?: number; limite?: number };
    if (!nom?.trim() || !segment_id || !expediteur_id)
      return res.status(400).json({ erreur: "nom, segment_id et expediteur_id requis" });

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

    // Le segment appartient au mandat ; son filtre est rejoue maintenant.
    const seg = (await q(`SELECT CLIENT_ID, FILTRE FROM LISTE WHERE ID = :id`, { id: segment_id }))
      .rows as { CLIENT_ID: number; FILTRE: string }[];
    if (!seg.length || seg[0].CLIENT_ID !== cid)
      return res.status(404).json({ erreur: "segment inconnu sur ce mandat" });
    const { where, binds } = construireFiltre(JSON.parse(seg[0].FILTRE));

    // Seuls les contacts investisseurs partent en campagne v1 : ce sont eux
    // qui portent langue et demarchage, et le mailer les reconnait par
    // CONTACT_ID. Les autres sources sont comptees et dites, pas oubliees.
    const cibles = await q(`
      SELECT SUBSTR(v.PERSON_KEY, 5) CONTACT_ID, v.EMAIL,
             TRIM(NVL(v.FIRST_NAME, ' ') || ' ' || NVL(v.LAST_NAME, ' ')) FULL_NAME,
             v.COUNTRY,
             REPLACE(REPLACE(REPLACE(NVL(JSON_SERIALIZE(i.LANGUAGES), '[]'),
                     '[', ''), ']', ''), '"', '') LANGUES
        FROM V_PERSONNES v
        JOIN INVESTORS.CONTACTS i ON 'inv:' || i.CONTACT_ID = v.PERSON_KEY
       WHERE ${where} AND v.PERSON_KEY LIKE 'inv:%' AND v.EMAIL IS NOT NULL
       FETCH FIRST ${Math.min(Number(limite) || 500, 2000)} ROWS ONLY`, binds);
    const horsInv = await q(`SELECT COUNT(*) N FROM V_PERSONNES v
       WHERE ${where} AND v.PERSON_KEY NOT LIKE 'inv:%' AND v.EMAIL IS NOT NULL`, binds);

    const lignes = cibles.rows as { CONTACT_ID: string; EMAIL: string; FULL_NAME: string;
      COUNTRY: string | null; LANGUES: string }[];
    if (!lignes.length) return res.status(422).json({ erreur: "segment vide cote investisseurs" });

    const csv = ["contact_id;email;full_name;country;languages"]
      .concat(lignes.map(l => [l.CONTACT_ID, l.EMAIL, l.FULL_NAME, l.COUNTRY ?? "", l.LANGUES]
        .map(x => String(x ?? "").replace(/;/g, ",")).join(";")))
      .join("\n");

    const prep = await preparer({
      name: nom.trim(), csv,
      client_id: cid, sender_email: e.EMAIL, sender_name: e.NOM_AFFICHAGE,
    });
    return res.json({ ok: true, ...prep,
      hors_investisseurs: (horsInv.rows as { N: number }[])[0].N });
  }

  res.setHeader("Allow", ["GET", "POST"]); res.status(405).end();
}
