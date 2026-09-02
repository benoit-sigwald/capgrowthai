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
    /*
     * La formule d'appel est COLLEE PAR NOUS, comme la signature.
     *
     * Deux tentatives pour l'obtenir du modele, deux echecs mesures le
     * 2026-09-02 : « Madame, » adresse a un homme, puis « Monsieur Sigwald, »
     * malgre l'interdiction explicite de deduire un genre. Un modele ne
     * s'empeche pas de deviner ; on cesse donc de lui demander. Ce qui doit
     * etre exact ne se genere pas.
     */
    "1. NE COMMENCE PAS par une salutation : elle est ajoutee avant ton texte. "
      + "Commence directement par le remerciement.",
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
      /*
       * Un « ok on fonce » de quatre mots ne dit pas dans quelle langue on
       * s'adresse a quelqu'un. Le message qu'on lui avait ecrit, si.
       */
      : "- Reponds dans la langue du MESSAGE RECU. S'il est trop court pour en "
        + "juger (moins d'une quinzaine de mots), reponds dans la langue du "
        + "message que NOUS avions envoye.",
    "- N'ecris ni « Madame » ni « Monsieur » : tu ne connais pas le genre de la "
      + "personne, et il ne se deduit pas d'un prenom.",
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

  const { html, consigne, mode, recu, contexte, client, destinataire, signature, envoye,
          langue, langueEnvoi } =
    (req.body ?? {}) as { html?: string; consigne?: string; mode?: string; recu?: string;
      contexte?: string; client?: number; destinataire?: string; signature?: string;
      envoye?: string; langue?: string; langueEnvoi?: string };
  const reponse = mode === "reponse";

  // Les reglages du mandat font la voix : sans eux, chaque reponse aurait un
  // ton different de la precedente.
  const cid = Number(client || 0);
  const reglagesBase = reponse && cid && clientAutorise(p, cid)
    ? await reglagesDuMandat(cid) : DEFAUTS;
  /*
   * La langue demandee a l'ecran l'emporte sur le reglage du mandat : c'est un
   * choix pris devant le message, pas un reglage general.
   */
  /*
   * Un message de quatre mots ne dit pas dans quelle langue on s'adresse a
   * quelqu'un. Demander l'arbitrage au modele ne suffit pas : mesure du
   * 2026-09-02, « ok on fonce » repondu en francais a un contact aborde en
   * anglais, malgre la consigne. On tranche donc ici.
   */
  const motsRecus = (recu || "").trim().split(/\s+/).filter(Boolean).length;
  const langueRetenue = langue && langue !== "auto" ? langue
    : (motsRecus < 15 && langueEnvoi ? langueEnvoi : null);
  const reglages = langueRetenue
    ? { ...reglagesBase, LANGUE: langueRetenue } : reglagesBase;

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

  /*
   * « Bonjour Prenom, » quand on connait le nom, la formule imposee du mandat
   * si elle existe, « Madame, Monsieur, » a defaut — jamais une deduction.
   */
  function formuleAppel() {
    /*
     * Le reglage « formule d'appel » est colle mot pour mot. Un utilisateur y
     * a ecrit une consigne — « choisir en fonction de l'email original » — qui
     * s'est retrouvee en tete du message envoye. Une formule d'appel est
     * courte et se termine par une virgule ; au-dela, c'est une intention, pas
     * une formule, et on l'ignore plutot que de la publier.
     */
    const impose = String(reglages.APPEL || "").trim();
    if (impose && impose.length <= 60 && !/\s(de|du|des|en|le|la|les)\s.*\s/.test(impose))
      return impose;
    // La salutation suit la langue du message, sinon on ecrit « Bonjour »
    // en tete d'une reponse anglaise.
    const anglais = reglages.LANGUE === "en";
    const nom = (destinataire || "").trim();
    if (!nom) return anglais ? "Dear Sir or Madam," : "Madame, Monsieur,";
    const prenom = nom.split(/\s+/)[0];
    return anglais ? `Hello ${prenom},` : `Bonjour ${prenom},`;
  }

  if (reponse) {
    const sig = (signature || "").trim();
    const appel = formuleAppel();
    let textes: string[];
    try {
      textes = await Promise.all(ORIENTATIONS.map(o => demander(o)));
    } catch (e) { return res.status(502).json({ erreur: (e as Error).message }); }
    const SAUT = "\n\n";
    const propositions = textes.filter(Boolean)
      .map(t => [appel, t, sig].filter(Boolean).join(SAUT));
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
