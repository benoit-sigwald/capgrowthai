import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { ciblesDuSegment } from "@/lib/cibles";
import { preparer } from "@/lib/mailer";

/*
 * Une campagne existante : lire, renommer, completer, annuler ce qui n'est pas
 * parti, supprimer.
 *
 * Ligne de conduite : ce qui est PARTI ne se modifie plus. Un e-mail envoye
 * existe dans une boite de reception ; le renier en base ne le rappelle pas et
 * fait mentir les taux. Ce qui est en attente, en revanche, n'appartient encore
 * a personne — il s'ajoute et se retire librement.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  const id = String(req.query.id);

  const c = (await q(`SELECT CAMPAIGN_ID, NAME, CLIENT_ID, TOTAL_TARGETED,
                             EXPEDITEUR_EMAIL, EXPEDITEUR_NOM
                        FROM INVESTORS.MAILING_CAMPAIGNS WHERE CAMPAIGN_ID = :id`, { id }))
    .rows as { CAMPAIGN_ID: string; NAME: string; CLIENT_ID: number | null;
               TOTAL_TARGETED: number; EXPEDITEUR_EMAIL: string | null;
               EXPEDITEUR_NOM: string | null }[];
  if (!c.length || !c[0].CLIENT_ID || !clientAutorise(p, c[0].CLIENT_ID))
    return res.status(404).json({ erreur: "campagne inconnue" });
  const camp = c[0];
  const cid = camp.CLIENT_ID as number;

  const compte = async () => ((await q(
    `SELECT COUNT(CASE WHEN SENT_AT IS NOT NULL THEN 1 END) ENVOYES,
            COUNT(CASE WHEN STATUS = 'pending' THEN 1 END) EN_ATTENTE
       FROM INVESTORS.MAILING_SENDS WHERE CAMPAIGN_ID = :id`, { id }))
    .rows as { ENVOYES: number; EN_ATTENTE: number }[])[0];

  if (req.method === "GET") return res.json({ campagne: camp, ...(await compte()) });

  // Tout le reste touche au ciblage ou a l'historique : reserve aux roles Arx.
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });

  if (req.method === "PATCH") {
    const { nom } = (req.body ?? {}) as { nom?: string };
    if (!nom?.trim()) return res.status(400).json({ erreur: "nom requis" });
    await q(`UPDATE INVESTORS.MAILING_CAMPAIGNS SET NAME = :n WHERE CAMPAIGN_ID = :id`,
            { n: nom.trim().slice(0, 200), id });
    return res.json({ ok: true });
  }

  if (req.method === "POST") {
    // Completer : meme expediteur, meme mandat, memes gabarits. Le mailer
    // ecarte de lui-meme les adresses deja ciblees par cette campagne.
    const { segment_id, limite } = (req.body ?? {}) as
      { segment_id?: number; limite?: number };
    if (!segment_id) return res.status(400).json({ erreur: "segment_id requis" });
    if (!camp.EXPEDITEUR_EMAIL)
      return res.status(409).json({ erreur: "campagne sans expediteur : elle ne peut pas etre completee" });

    const cibles = await ciblesDuSegment(Number(segment_id), cid, limite);
    if (!cibles) return res.status(404).json({ erreur: "segment inconnu sur ce mandat" });
    if (!cibles.nombre) return res.status(422).json({ erreur: "segment vide cote investisseurs" });

    const prep = await preparer({ campaign_id: id, name: camp.NAME, csv: cibles.csv,
                                  client_id: cid });
    return res.json({ ok: true, ...prep, hors_investisseurs: cibles.horsInvestisseurs });
  }

  if (req.method === "DELETE") {
    const n = await compte();
    const { annuler_en_attente } = (req.body ?? {}) as { annuler_en_attente?: boolean };

    if (annuler_en_attente) {
      const r = await q(`DELETE FROM INVESTORS.MAILING_SENDS
                          WHERE CAMPAIGN_ID = :id AND STATUS = 'pending' AND SENT_AT IS NULL`,
                        { id });
      // TOTAL_TARGETED doit suivre, sinon les taux se lisent sur une cible qui
      // n'existe plus et paraissent moins bons qu'ils ne sont.
      await q(`UPDATE INVESTORS.MAILING_CAMPAIGNS
                  SET TOTAL_TARGETED = (SELECT COUNT(*) FROM INVESTORS.MAILING_SENDS
                                         WHERE CAMPAIGN_ID = :id)
                WHERE CAMPAIGN_ID = :id`, { id });
      return res.json({ ok: true, annules: r.rowsAffected ?? 0 });
    }

    /*
     * Une campagne dont un seul e-mail est parti ne se supprime pas : ses
     * envois sont la trace de ce que des gens ont recu, et les ouvertures et
     * reponses continuent d'y arriver. On propose d'annuler le reste.
     */
    if (n.ENVOYES)
      return res.status(409).json({
        erreur: `${n.ENVOYES} e-mail(s) déjà partis : cette campagne ne se supprime pas. `
              + `Vous pouvez annuler les ${n.EN_ATTENTE} envoi(s) en attente.`,
        envoyes: n.ENVOYES, en_attente: n.EN_ATTENTE });

    await q(`DELETE FROM INVESTORS.MAILING_SENDS WHERE CAMPAIGN_ID = :id`, { id });
    await q(`DELETE FROM INVESTORS.MAILING_CAMPAIGNS WHERE CAMPAIGN_ID = :id`, { id });
    return res.json({ ok: true, supprimes: n.EN_ATTENTE });
  }

  res.setHeader("Allow", ["GET", "PATCH", "POST", "DELETE"]); res.status(405).end();
}
