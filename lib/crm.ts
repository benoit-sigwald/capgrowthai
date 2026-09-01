/*
 * Vocabulaire commercial, partage par les API et les ecrans.
 *
 * Il vit ici en TypeScript mais fait foi en base : les memes valeurs sont
 * gravees dans les contraintes CHECK de CONTACT_STATE. La base refuse ce que
 * l'ecran ne devrait pas proposer — l'ecran ne fait que le rendre agreable.
 */
export const STATUTS = ["a_contacter", "en_sequence", "contacte", "a_reveiller",
  "a_repondu", "en_discussion", "rdv", "perdu", "gagne"] as const;
export type Statut = (typeof STATUTS)[number];

export const LIBELLES: Record<Statut, [string, string]> = {
  a_contacter: ["À contacter", ""],
  en_sequence: ["En séquence", ""],
  contacte: ["Contacté", "ok"],
  a_reveiller: ["À réveiller", "warn"],
  a_repondu: ["A répondu", "ok"],
  en_discussion: ["En discussion", "ok"],
  rdv: ["Rendez-vous", "ok"],
  perdu: ["Perdu", "crit"],
  gagne: ["Gagné", "ok"],
};

// Les colonnes du pipeline : « a_contacter » n'y figure pas, c'est la reserve
// (3 879 personnes), pas une etape ou quelqu'un travaille.
export const COLONNES_PIPELINE: Statut[] = ["en_sequence", "contacte", "a_repondu",
  "en_discussion", "rdv", "gagne", "perdu"];

// Etats ou personne n'attend rien : la contrainte CK_CS_ACTION_DUE n'exige
// pas de prochaine action. Doit rester identique a la base.
export const SANS_ACTION_DUE: string[] = ["a_contacter", "en_sequence", "gagne", "perdu"];

export const TYPES_ACTION = ["email", "appel", "linkedin", "relance", "rdv", "autre"];
export const MOTIFS_PERTE = ["pas_interesse", "mauvais_moment", "concurrent",
  "injoignable", "hors_cible", "opt_out"];
export const CANAUX = ["email", "linkedin", "appel", "formulaire", "rencontre", "autre"];
export const TYPES_INTERACTION = ["appel", "note", "rencontre", "message", "visite"];

export const exigeAction = (s: string) => !SANS_ACTION_DUE.includes(s);

/*
 * La requete du pipeline : le referentiel, filtre par mandat.
 *
 * Jointure a gauche sur l'etat DU MANDAT COURANT : une personne suivie
 * ailleurs n'apparait pas ici avec l'etat de l'autre mandat.
 */
export const SQL_PIPELINE = `
  SELECT p.PERSON_KEY, p.SOURCE, p.FIRST_NAME, p.LAST_NAME, p.EMAIL, p.LINKEDIN_URL,
         p.TITLE, p.COMPANY, p.CITY, p.COUNTRY, p.PHONE, p.ORG_KEY,
         NVL(e.STATUT, 'a_contacter') AS STATUT,
         GREATEST(NVL(e.OPT_OUT, 0), p.OPT_OUT) AS OPT_OUT,
         e.PROPRIETAIRE, e.ACTION_TYPE, e.ACTION_LE, e.ACTION_NOTE,
         e.DERNIER_CONTACT_LE, e.DERNIER_CANAL, e.DERNIERE_REPONSE_LE,
         e.MOTIF_PERTE, e.NOTES, e.UPDATED_AT,
         CASE WHEN e.ACTION_LE IS NULL THEN NULL
              ELSE TRUNC(e.ACTION_LE) - TRUNC(SYSDATE) END AS JOURS
    FROM V_PERSONNES p
    LEFT JOIN CONTACT_STATE e
      ON e.PERSON_KEY = p.PERSON_KEY AND e.CLIENT_ID = :cid`;
