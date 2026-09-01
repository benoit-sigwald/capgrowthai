import type { NextApiRequest, NextApiResponse } from "next";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { ciblesDeLaListe, ciblesDuSegment, PLAFOND_CIBLES } from "@/lib/cibles";

/*
 * Combien de contacts partiraient, si on preparait maintenant.
 *
 * Ecrit le 2026-09-01 apres une surprise legitime : une campagne batie sur une
 * liste de deux personnes n'avait envoye qu'un seul e-mail. Rien n'etait casse
 * — la seconde n'est pas un contact investisseur, et le mailer ne sait ecrire
 * qu'a ceux-la — mais l'ecran ne le disait qu'APRES la preparation. Le compte
 * se lit desormais avant.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  const segmentId = Number(req.query.segment_id || 0);
  const listeId = Number(req.query.liste_id || 0);
  if (!segmentId && !listeId)
    return res.status(400).json({ erreur: "segment_id ou liste_id requis" });

  const limite = Math.min(Number(req.query.limite) || PLAFOND_CIBLES, PLAFOND_CIBLES);
  const c = segmentId ? await ciblesDuSegment(segmentId, cid, limite)
                      : await ciblesDeLaListe(listeId, cid, limite);
  if (!c) return res.status(404).json({ erreur: "source inconnue sur ce mandat" });

  res.json({ cibles: c.nombre, nouveaux: c.horsInvestisseurs,
             plafond_atteint: c.nombre >= limite });
}
