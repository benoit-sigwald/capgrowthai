/*
 * Le referentiel : lecture de V_PERSONNES, et ecriture A LA SOURCE.
 *
 * Une personne editee a l'ecran est corrigee dans sa table d'origine, resolue
 * par le prefixe de PERSON_KEY. La vue reste une vue : ecrire dans une copie
 * creerait deux verites, et le prochain import ecraserait la saisie.
 */
export const CHAMPS_GENERIQUES = ["prenom", "nom", "titre", "societe", "email",
  "telephone", "linkedin", "ville", "pays", "notes"] as const;
export type ChampGenerique = (typeof CHAMPS_GENERIQUES)[number];

export interface CibleEcriture {
  table: string;
  cle: string;
  valeurCle: string | number;
  colonnes: Partial<Record<ChampGenerique, string>>;
}

export function resoudreSource(personKey: string): CibleEcriture | null {
  if (personKey.startsWith("inv:")) {
    return {
      table: "INVESTORS.CONTACTS", cle: "CONTACT_ID", valeurCle: personKey.slice(4),
      colonnes: { prenom: "FIRST_NAME", nom: "LAST_NAME", titre: "JOB_TITLE",
        societe: "ORG_NAME", email: "EMAIL", telephone: "PHONE",
        linkedin: "LINKEDIN_URL", ville: "CITY", pays: "COUNTRY", notes: "NOTES" },
    };
  }
  if (personKey.startsWith("pro:")) {
    const id = Number(personKey.slice(4));
    if (!Number.isInteger(id)) return null;
    // societe et pays viennent du rattachement a ENTREPRISES : pas modifiables ici.
    return {
      table: "PROSPECTS.CONTACTS", cle: "ID", valeurCle: id,
      colonnes: { prenom: "PRENOM", nom: "NOM", titre: "FONCTION", email: "EMAIL",
        telephone: "TELEPHONE", linkedin: "LINKEDIN_URL", ville: "LOCALISATION" },
    };
  }
  const gate = personKey.match(/^gate:([a-z0-9_]+):(\d+)$/);
  if (gate) {
    // Le nom du site vient de nos propres schemas, mais il entre dans un nom
    // de table : la regex stricte est la garde contre l'injection.
    return {
      table: `GATE_${gate[1].toUpperCase()}.PROSPECTS`, cle: "ID", valeurCle: Number(gate[2]),
      colonnes: { prenom: "FIRST_NAME", nom: "LAST_NAME", societe: "COMPANY",
        email: "EMAIL", telephone: "PHONE", ville: "CITY", pays: "COUNTRY", notes: "NOTES" },
    };
  }
  // dir: le nom vit dans ENTREPRISES.DIRIGEANT — l'editer ici reecrirait la
  // fiche entreprise. Motif rendu par l'API, pas d'ecriture.
  return null;
}

export function construireFiltre(p: Record<string, string | undefined>) {
  const w: string[] = [];
  const binds: Record<string, unknown> = {};
  if (p.q) {
    w.push(`(UPPER(FIRST_NAME || ' ' || LAST_NAME) LIKE :q
             OR UPPER(NVL(COMPANY,' ')) LIKE :q OR UPPER(NVL(TITLE,' ')) LIKE :q
             OR UPPER(NVL(EMAIL,' ')) LIKE :q)`);
    binds.q = `%${p.q.toUpperCase()}%`;
  }
  if (p.source) {
    if (p.source === "gate") w.push(`SOURCE LIKE 'gate:%'`);
    else { w.push(`SOURCE = :source`); binds.source = p.source; }
  }
  if (p.canal === "email") w.push(`EMAIL IS NOT NULL`);
  if (p.canal === "linkedin") w.push(`LINKEDIN_URL IS NOT NULL`);
  if (p.canal === "joignable") w.push(`(EMAIL IS NOT NULL OR LINKEDIN_URL IS NOT NULL)`);
  if (p.pays) { w.push(`UPPER(COUNTRY) = UPPER(:pays)`); binds.pays = p.pays; }
  if (p.territoire) { w.push(`TERRITOIRE = :territoire`); binds.territoire = p.territoire; }
  if (p.secteur) { w.push(`SECTEUR = :secteur`); binds.secteur = p.secteur; }
  if (p.optout === "1") w.push(`OPT_OUT = 1`);
  return { where: w.length ? w.join(" AND ") : "1 = 1", binds };
}
