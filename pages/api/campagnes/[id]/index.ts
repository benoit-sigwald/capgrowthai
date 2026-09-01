import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises, exigerAdmin } from "@/lib/portee";
import { ciblesDeLaListe, ciblesDuSegment } from "@/lib/cibles";
import { preparer, renommerCampagne, supprimerCampagne } from "@/lib/mailer";

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
    await renommerCampagne(id, nom.trim());
    return res.json({ ok: true });
  }

  if (req.method === "POST") {
    // Completer : meme expediteur, meme mandat, memes gabarits. Le mailer
    // ecarte de lui-meme les adresses deja ciblees par cette campagne.
    const { segment_id, liste_id, limite, template_ids } = (req.body ?? {}) as
      { segment_id?: number; liste_id?: number; limite?: number; template_ids?: string[] };
    if (!segment_id && !liste_id)
      return res.status(400).json({ erreur: "un segment ou une liste requis" });
    if (!camp.EXPEDITEUR_EMAIL)
      return res.status(409).json({ erreur: "campagne sans expediteur : elle ne peut pas etre completee" });

    const cibles = segment_id
      ? await ciblesDuSegment(Number(segment_id), cid, limite)
      : await ciblesDeLaListe(Number(liste_id), cid, limite);
    if (!cibles) return res.status(404).json({
      erreur: `${segment_id ? "segment" : "liste"} inconnu sur ce mandat` });
    if (!cibles.nombre) return res.status(422).json({ erreur: "segment vide cote investisseurs" });

    const prep = await preparer({ campaign_id: id, name: camp.NAME, csv: cibles.csv,
                                  client_id: cid,
                                  template_ids: Array.isArray(template_ids) ? template_ids : undefined });
    return res.json({ ok: true, ...prep, hors_investisseurs: cibles.horsInvestisseurs });
  }

  if (req.method === "DELETE") {
    const n = await compte();
    const { annuler_en_attente, forcer } = (req.body ?? {}) as
      { annuler_en_attente?: boolean; forcer?: boolean };

    // Le mailer recalcule TOTAL_TARGETED : sinon les taux se liraient sur une
    // cible qui n'existe plus et paraitraient moins bons qu'ils ne sont.
    if (annuler_en_attente) return res.json(await supprimerCampagne(id, true));

    /*
     * Une campagne dont un seul e-mail est parti ne se supprime pas : ses
     * envois sont la trace de ce que des gens ont recu, et les ouvertures et
     * reponses continuent d'y arriver. On propose d'annuler le reste.
     */
    /*
     * Passer outre reste possible — une campagne de test doit pouvoir
     * disparaitre — mais c'est une decision d'administrateur, prise
     * explicitement, et l'ecran dit ce qu'elle emporte.
     */
    if (n.ENVOYES && forcer && !exigerAdmin(p))
      return res.status(403).json({ erreur: "supprimer une campagne deja partie : reserve a l'administrateur" });
    if (n.ENVOYES && !forcer)
      return res.status(409).json({
        erreur: `${n.ENVOYES} e-mail(s) déjà partis : cette campagne ne se supprime pas. `
              + `Vous pouvez annuler les ${n.EN_ATTENTE} envoi(s) en attente.`,
        envoyes: n.ENVOYES, en_attente: n.EN_ATTENTE });

    return res.json({ ...(await supprimerCampagne(id, false, !!forcer)),
                      supprimes: n.EN_ATTENTE, envois_effaces: forcer ? n.ENVOYES : 0 });
  }

  res.setHeader("Allow", ["GET", "PATCH", "POST", "DELETE"]); res.status(405).end();
}
