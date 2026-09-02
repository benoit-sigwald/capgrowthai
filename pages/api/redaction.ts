import type { NextApiRequest, NextApiResponse } from "next";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { DEFAUTS, reglagesDuMandat } from "./reglages-ia";

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
const TONS: Record<string, string> = {
  formel: "Registre soutenu, vouvoiement, distance courtoise. Aucune familiarite, "
        + "aucune exclamation, aucune abreviation.",
  cordial: "Registre professionnel et chaleureux, vouvoiement. Cordial sans familiarite.",
  direct: "Registre professionnel et direct, vouvoiement. On va au fait, sans secheresse "
        + "et sans supprimer les formules d'usage.",
};

const LONGUEURS: Record<string, string> = {
  bref: "Trois a cinq phrases, formules de politesse comprises.",
  standard: "Un a deux paragraphes courts, formules de politesse comprises.",
  detaille: "Trois paragraphes au plus, chacun sur un point distinct.",
};

/*
 * Redaction d'une reponse.
 *
 * Ce que le premier jet ratait, et qui compte plus que le reste : ces messages
 * s'adressent a des investisseurs, souvent en premiere prise de contact. Une
 * reponse sans formule d'appel ni de conge se lit comme un message interne
 * envoye par erreur. Les formules ne sont pas un ornement — elles sont la
 * marque qu'on ecrit a quelqu'un.
 */
function consigneReponse(r: typeof DEFAUTS) {
  const lignes = [
    "Tu rediges la REPONSE a un e-mail professionnel recu, en texte simple.",
    "",
    "Registre : " + (TONS[r.TON] || TONS.formel),
    "Longueur : " + (LONGUEURS[r.LONGUEUR] || LONGUEURS.bref),
    "",
    "Structure imposee, dans cet ordre :",
    r.APPEL
      ? `1. Formule d'appel EXACTEMENT : « ${r.APPEL} »`
      : "1. Une formule d'appel adaptee (« Madame, », « Monsieur, », ou « Bonjour <Prenom>, » "
        + "si le prenom est connu et le ton cordial). Jamais de message qui commence sans salutation.",
    "2. Un remerciement bref pour le message recu, ou un accuse de reception.",
    "3. Le fond de la reponse.",
    r.CONGE
      ? `4. Formule de conge EXACTEMENT : « ${r.CONGE} »`
      : "4. Une formule de conge d'usage (« Bien cordialement, », « Je vous prie d'agreer, "
        + "Madame, Monsieur, mes salutations distinguees, » selon le registre).",
    // La signature n'est PAS redigee par le modele : elle est ajoutee apres,
    // mot pour mot. Un modele qui « redige une signature » invente un
    // telephone plausible que personne ne relit.
    "5. AUCUNE signature, aucun nom en fin de message : elle est ajoutee ensuite.",
    "",
    "Regles absolues :",
    "- Rends UNIQUEMENT le corps du message, sans objet, sans commentaire, sans balise.",
    "- Texte simple : ni HTML ni Markdown.",
    "- N'invente aucun chiffre, aucun montant, aucune date, aucun rendement, aucun engagement. "
      + "Si la reponse en appelle un que tu n'as pas, propose un echange plutot qu'une valeur.",
    "- Ne promets pas de document que tu ne sais pas exister.",
    r.LANGUE && r.LANGUE !== "auto"
      ? `- Reponds en ${r.LANGUE === "fr" ? "francais" : "anglais"}.`
      : "- Reponds dans la LANGUE DU MESSAGE RECU, sans exception : c'est celle "
        + "que la personne a choisie en ecrivant.",
    "- Nomme le destinataire dans la formule d'appel quand son nom est donne.",
  ];
  if (r.CONTEXTE) lignes.push("", "Ce que tu dois savoir de la maison :", r.CONTEXTE);
  return lignes.join("\n");
}

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

  const { html, consigne, mode, recu, contexte, client, destinataire, signature } =
    (req.body ?? {}) as { html?: string; consigne?: string; mode?: string; recu?: string;
      contexte?: string; client?: number; destinataire?: string; signature?: string };
  const reponse = mode === "reponse";

  // Les reglages du mandat font la voix : sans eux, chaque reponse aurait un
  // ton different de la precedente.
  const cid = Number(client || 0);
  const reglages = reponse && cid && clientAutorise(p, cid)
    ? await reglagesDuMandat(cid) : DEFAUTS;

  if (reponse) {
    if (!recu?.trim()) return res.status(400).json({ erreur: "message reçu vide" });
  } else {
    if (!consigne?.trim()) return res.status(400).json({ erreur: "dites ce qu'il faut changer" });
    if (!html?.trim()) return res.status(400).json({ erreur: "gabarit vide" });
    if (html.length > PLAFOND) return res.status(413).json({ erreur: "gabarit trop long" });
  }

  /*
   * Trois propositions plutot qu'une.
   *
   * On juge mieux un texte en le comparant qu'en le corrigeant. Trois appels
   * separes, avec une orientation differente, plutot qu'un seul appel a qui
   * l'on demanderait trois variantes : la sortie d'un modele qui doit separer
   * ses reponses par un marqueur finit toujours par se decouper de travers.
   */
  const ORIENTATIONS = [
    "Va droit au but, le plus court possible.",
    "Developpe un peu : reprends le point souleve avant de repondre.",
    "Ton plus chaleureux, sans quitter le registre professionnel.",
  ];

  async function demander(orientation?: string) {
    const rq = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cle}` },
    body: JSON.stringify({
      model: MODELE, temperature: orientation ? 0.6 : 0.2,
      messages: reponse
        ? [{ role: "system", content: consigneReponse(reglages) },
           { role: "user", content:
             (contexte ? `Contexte : ${contexte}\n\n` : "")
             + (destinataire ? `Tu écris à : ${destinataire}\n\n` : "")
             + `Message reçu :\n${recu}\n\n`
             + (consigne?.trim()
                 ? "Ce que je veux répondre : " + consigne.trim() + "\n"
                 : "Rédige une réponse appropriée.\n")
             + (orientation ? "\nOrientation : " + orientation : "") }]
        : [{ role: "system", content: CONSIGNE_SYSTEME },
           { role: "user", content:
             `Demande : ${(consigne ?? "").trim()}\n\nGabarit actuel :\n${html}` }],
    }),
    });
    if (!rq.ok) throw new Error(`modèle indisponible (${rq.status}) `
      + (await rq.text()).slice(0, 160));
    const jr = await rq.json() as { choices?: { message?: { content?: string } }[] };
    // Le modele encadre parfois sa reponse malgre la consigne.
    return (jr.choices?.[0]?.message?.content || "").trim()
      .replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();
  }

  if (reponse) {
    const sig = (signature || "").trim();
    let textes: string[];
    try {
      textes = await Promise.all(ORIENTATIONS.map(o => demander(o)));
    } catch (e) { return res.status(502).json({ erreur: (e as Error).message }); }
    const propositions = textes.filter(Boolean)
      .map(t => (sig ? `${t}

${sig}` : t));
    if (!propositions.length) return res.status(502).json({ erreur: "réponse vide du modèle" });
    return res.json({ ok: true, propositions, html: propositions[0] });
  }

  let sortie: string;
  try { sortie = await demander(); }
  catch (e) { return res.status(502).json({ erreur: (e as Error).message }); }
  if (!sortie) return res.status(502).json({ erreur: "réponse vide du modèle" });

  /*
   * Verification, pas confiance : on compare les variables presentes avant et
   * apres. Une disparition n'est pas une retouche, c'est une regression que
   * personne ne verrait avant l'envoi.
   */
  const variables = (t: string) => [...t.matchAll(/\{\{([a-z_]+)\}\}/g)].map(m => m[1]);
  const avant = new Set(variables(html!));
  const apres = new Set(variables(sortie));
  const perdues = [...avant].filter(v => !apres.has(v));

  res.json({ ok: true, html: sortie, perdues,
             avertissement: perdues.length
               ? `Variables disparues : ${perdues.join(", ")}. À vérifier avant d'enregistrer.`
               : null });
}
