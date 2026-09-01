import type { NextApiRequest, NextApiResponse } from "next";
import { porteeDepuis } from "@/lib/auth";
import { contactsAutorises } from "@/lib/portee";

/*
 * Retouche d'un gabarit par un modele de langue.
 *
 * Trois regles, et elles ne sont pas negociables :
 *
 *   1. Le modele REND une proposition, il n'enregistre rien. Un texte qui part
 *      a des investisseurs se relit avant d'exister. L'ecran affiche le
 *      resultat ; c'est l'utilisateur qui enregistre, ou non.
 *   2. Les {{variables}} doivent survivre intactes. Une variable perdue, et
 *      tous les destinataires recoivent le prenom de personne.
 *   3. On ne rend que du HTML. Pas d'explication, pas de bloc de code : la
 *      sortie remplace le corps du message telle quelle.
 *
 * Le modele est Mistral, deja utilise dans le parc — on n'ouvre pas un second
 * fournisseur pour une fonction de confort.
 */
const MODELE = process.env.MISTRAL_MODELE || "mistral-large-latest";
const PLAFOND = 60000;   // caracteres de gabarit acceptes

const CONSIGNE_SYSTEME = `Tu retouches le corps HTML d'un e-mail professionnel.

Regles absolues :
- Rends UNIQUEMENT le HTML complet du message, sans commentaire ni balise de code.
- Conserve EXACTEMENT toutes les variables de la forme {{nom}} : ne les traduis pas,
  ne les renomme pas, n'en invente pas.
- Conserve la structure, les styles en ligne et la compatibilite avec les clients de
  messagerie (tableaux, styles inline). Ne remplace pas la mise en page par du CSS moderne.
- N'invente aucun chiffre, aucun montant, aucune date, aucune promesse : si la demande
  exige une donnee que tu n'as pas, laisse le texte existant tel quel.
- Reponds dans la langue du gabarit.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  if (req.method !== "POST") { res.setHeader("Allow", ["POST"]); return res.status(405).end(); }

  const cle = process.env.MISTRAL_API_KEY;
  if (!cle) return res.status(503).json({ erreur: "aucune clé de modèle configurée sur le serveur" });

  const { html, consigne } = (req.body ?? {}) as { html?: string; consigne?: string };
  if (!consigne?.trim()) return res.status(400).json({ erreur: "dites ce qu'il faut changer" });
  if (!html?.trim()) return res.status(400).json({ erreur: "gabarit vide" });
  if (html.length > PLAFOND) return res.status(413).json({ erreur: "gabarit trop long" });

  const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cle}` },
    body: JSON.stringify({
      model: MODELE, temperature: 0.2,
      messages: [
        { role: "system", content: CONSIGNE_SYSTEME },
        { role: "user", content: `Demande : ${consigne.trim()}\n\nGabarit actuel :\n${html}` },
      ],
    }),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 200);
    return res.status(502).json({ erreur: `modèle indisponible (${r.status}) ${detail}` });
  }
  const j = await r.json() as { choices?: { message?: { content?: string } }[] };
  let sortie = (j.choices?.[0]?.message?.content || "").trim();
  // Le modele encadre parfois sa reponse malgre la consigne.
  sortie = sortie.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (!sortie) return res.status(502).json({ erreur: "réponse vide du modèle" });

  /*
   * Verification, pas confiance : on compare les variables presentes avant et
   * apres. Une disparition n'est pas une retouche, c'est une regression que
   * personne ne verrait avant l'envoi.
   */
  const variables = (t: string) => [...t.matchAll(/\{\{([a-z_]+)\}\}/g)].map(m => m[1]);
  const avant = new Set(variables(html));
  const apres = new Set(variables(sortie));
  const perdues = [...avant].filter(v => !apres.has(v));

  res.json({ ok: true, html: sortie, perdues,
             avertissement: perdues.length
               ? `Variables disparues : ${perdues.join(", ")}. À vérifier avant d'enregistrer.`
               : null });
}
