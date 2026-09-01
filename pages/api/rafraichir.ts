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

  /*
   * Le routeur rend la sortie de ses scripts, telle qu'ils l'impriment :
   * « sync : {'lus': 1, 'appliques': 1, ...} ». C'est lisible pour qui debogue,
   * illisible sur un ecran — et c'est exactement ce qui s'affichait a
   * l'utilisateur. On en extrait les nombres, on jette la forme.
   */
  const nombre = (bloc: { sortie?: string } | undefined, ...cles: string[]) => {
    const texte = bloc?.sortie || "";
    for (const cle of cles) {
      // Double echappement voulu : dans un gabarit, « \s » perdrait sa barre
      // et la recherche ne trouverait plus rien.
      const m = new RegExp(`'${cle}':\\s*(\\d+)`).exec(texte);
      if (m) return Number(m[1]);
    }
    return 0;
  };

  const evenements = nombre(r.evenements, "appliques", "nouveaux_evenements");
  const clics = nombre(r.clics, "envois_mis_a_jour", "nouveaux_clics");
  const reponses = nombre(r.reponses, "reponses", "nouveaux");

  const parts = [
    evenements ? `${evenements} événement(s)` : "",
    clics ? `${clics} clic(s)` : "",
    reponses ? `${reponses} réponse(s)` : "",
  ].filter(Boolean);

  res.json({ ok: true, evenements, clics, reponses,
             resume: parts.length ? `${parts.join(", ")} repris.`
                                  : "Rien de nouveau depuis la dernière relève." });
}
