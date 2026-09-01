import type { NextApiRequest, NextApiResponse } from "next";
import { porteeDepuis } from "@/lib/auth";
import { contactsAutorises } from "@/lib/portee";
import { appelMailer } from "@/lib/mailer";

/*
 * Va chercher tout de suite les evenements du routeur.
 *
 * Les remises, ouvertures, clics et reponses n'arrivent pas d'eux-memes : le
 * routeur les tient, et un passage horaire les ingere. Une heure est le bon
 * rythme pour une campagne de plusieurs centaines d'envois ; c'est une
 * eternite quand on vient d'ouvrir soi-meme le message de test et qu'on
 * regarde le compteur. Ce bouton fait le meme travail, a la demande.
 *
 * Aucun raccourci : c'est le meme appel que le passage horaire, donc une seule
 * facon d'ingerer, et jamais deux verites sur le meme compteur.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  if (req.method !== "POST") { res.setHeader("Allow", ["POST"]); return res.status(405).end(); }

  const r = await appelMailer("/sync", {}) as Record<string, { sortie?: string }>;
  // On relaie la sortie du routeur telle quelle : inventer un resume ici
  // reviendrait a recompter ce qu'il vient de compter.
  const lire = (bloc?: { sortie?: string }) => (bloc?.sortie || "").trim();
  res.json({ ok: true,
             clics: lire(r.clics), evenements: lire(r.evenements), reponses: lire(r.reponses) });
}
