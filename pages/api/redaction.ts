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
/*
 * « mistral-large » est refuse par l'abonnement (403 tier_not_allowed, mesure
 * du 2026-09-01) ; « small » repond et suffit largement pour retoucher un
 * paragraphe. La variable permet d'en changer sans redeployer le code.
 */
const MODELE = process.env.MISTRAL_MODELE || "mistral-small-latest";
const PLAFOND = 60000;   // caracteres de gabarit acceptes

/*
 * Deux usages, deux consignes. Repondre a quelqu'un n'est pas retoucher une
 * mise en page : la sortie est du texte simple, courte, et n'invente rien.
 */
const CONSIGNE_REPONSE = `Tu rediges la REPONSE a un e-mail recu, en texte simple.

Regles absolues :
- Rends UNIQUEMENT le corps du message, sans objet, sans commentaire, sans balise.
- Texte simple : pas de HTML, pas de Markdown.
- Bref et direct : quelques phrases. Un investisseur lit vite.
- N'invente aucun chiffre, aucun montant, aucune date, aucun engagement. Si la
  reponse en demande un que tu n'as pas, propose un echange plutot qu'une valeur.
- Reprends la langue du message recu.
- Termine par une formule sobre, sans signature : l'expediteur ajoute la sienne.`;

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

  const { html, consigne, mode, recu, contexte } = (req.body ?? {}) as
    { html?: string; consigne?: string; mode?: string; recu?: string; contexte?: string };
  const reponse = mode === "reponse";

  if (reponse) {
    if (!recu?.trim()) return res.status(400).json({ erreur: "message reçu vide" });
  } else {
    if (!consigne?.trim()) return res.status(400).json({ erreur: "dites ce qu'il faut changer" });
    if (!html?.trim()) return res.status(400).json({ erreur: "gabarit vide" });
    if (html.length > PLAFOND) return res.status(413).json({ erreur: "gabarit trop long" });
  }

  const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cle}` },
    body: JSON.stringify({
      model: MODELE, temperature: 0.2,
      messages: reponse
        ? [{ role: "system", content: CONSIGNE_REPONSE },
           { role: "user", content:
             (contexte ? `Contexte : ${contexte}\n\n` : "")
             + `Message reçu :\n${recu}\n\n`
             + (consigne?.trim() ? `Ce que je veux répondre : ${consigne.trim()}`
                                 : "Rédige une réponse appropriée.") }]
        : [{ role: "system", content: CONSIGNE_SYSTEME },
           { role: "user", content:
             `Demande : ${(consigne ?? "").trim()}\n\nGabarit actuel :\n${html}` }],
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
  if (reponse) return res.json({ ok: true, html: sortie, perdues: [], avertissement: null });

  const variables = (t: string) => [...t.matchAll(/\{\{([a-z_]+)\}\}/g)].map(m => m[1]);
  const avant = new Set(variables(html!));
  const apres = new Set(variables(sortie));
  const perdues = [...avant].filter(v => !apres.has(v));

  res.json({ ok: true, html: sortie, perdues,
             avertissement: perdues.length
               ? `Variables disparues : ${perdues.join(", ")}. À vérifier avant d'enregistrer.`
               : null });
}
