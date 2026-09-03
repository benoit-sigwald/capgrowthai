/*
 * Le referentiel : lecture de V_PERSONNES, et ecriture A LA SOURCE.
 *
 * Une personne editee a l'ecran est corrigee dans sa table d'origine, resolue
 * par le prefixe de PERSON_KEY. La vue reste une vue : ecrire dans une copie
 * creerait deux verites, et le prochain import ecraserait la saisie.
 */
/*
 * Le type d'entreprise, regroupe en familles.
 *
 * SECTEUR porte 195 valeurs distinctes, et la typologie investisseur y existe
 * en DEUX vocabulaires : « Family office » (31 853 fiches) et « family_office »
 * (3 097), « Gestion de patrimoine » (14 214), « wealth_manager » (2 637) et
 * « cgp » (1 746) — la meme realite sous quatre etiquettes, selon la source qui
 * a charge la fiche.
 *
 * Cocher « Family office » doit prendre les deux. Une case par etiquette brute
 * aurait donne un segment amputé de 10 % sans que rien ne le signale : c'est le
 * genre d'erreur qu'on ne decouvre qu'en comptant les envois.
 *
 * On regroupe donc a l'usage plutot que de reecrire la base : les fiches
 * gardent la valeur de leur source, et l'ecran parle une seule langue.
 */
export const FAMILLES: { id: string; libelle: string; variantes: string[] }[] = [
  { id: "family_office", libelle: "Family office",
    variantes: ["Family office", "family_office"] },
  { id: "gestion_patrimoine", libelle: "Gestion de patrimoine / CGP",
    variantes: ["Gestion de patrimoine", "wealth_manager", "cgp",
                "Conseil en gestion de patrimoine"] },
  { id: "club_deal", libelle: "Club deal / immobilier",
    variantes: ["Club deal / immobilier"] },
  { id: "promoteur", libelle: "Promoteur immobilier",
    variantes: ["promoteur"] },
  { id: "capital_investissement", libelle: "Capital-investissement",
    variantes: ["pe", "Capital-investissement"] },
  { id: "capital_risque", libelle: "Capital-risque",
    variantes: ["vc", "Capital-risque"] },
  { id: "dette", libelle: "Dette privée",
    variantes: ["debt_fund", "Fonds de dette"] },
  { id: "angel", libelle: "Business angels",
    variantes: ["angel", "angel_network"] },
  { id: "crowdfunding", libelle: "Financement participatif",
    variantes: ["crowdfunding"] },
];

/** Toutes les etiquettes brutes d'une liste de familles. */
export function variantesDe(familles: string[]): string[] {
  const ids = new Set(familles);
  return FAMILLES.filter(f => ids.has(f.id)).flatMap(f => f.variantes);
}

/** La famille d'une etiquette brute, si elle en a une. */
export function familleDe(secteur: string): string | null {
  return FAMILLES.find(f => f.variantes.includes(secteur))?.id ?? null;
}

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
  /*
   * Les bases se cumulent, elles aussi.
   *
   * Le selecteur imposait UNE base : filtrer « Investisseurs » masquait donc en
   * silence les 1 856 adresses du referentiel prospects, et l'ecran affichait
   * 953 sans dire ce qu'il laissait dehors.
   */
  const sources = String(p.source || "").split(",").map(x => x.trim()).filter(Boolean);
  if (sources.length) {
    const conditions = sources.map((src, i) => {
      if (src === "gate") return `SOURCE LIKE 'gate:%'`;
      binds[`src${i}`] = src;
      return `SOURCE = :src${i}`;
    });
    w.push(conditions.length === 1 ? conditions[0] : `(${conditions.join(" OR ")})`);
  }
  /*
   * Les canaux se cumulent, et se lisent en OU.
   *
   * Un seul choix ne suffisait pas : « e-mail OU telephone » est une question
   * courante — qui puis-je atteindre autrement que par LinkedIn — et il fallait
   * lancer deux recherches pour y repondre. La valeur reste une chaine, avec des
   * virgules : les segments deja enregistres, qui portent « joignable » ou
   * « email », continuent de fonctionner sans reprise.
   */
  const CANAUX: Record<string, string> = {
    email: `EMAIL IS NOT NULL`,
    linkedin: `LINKEDIN_URL IS NOT NULL`,
    telephone: `PHONE IS NOT NULL`,
  };
  // « Joignable » veut dire qu'il existe un moyen de parler a cette personne :
  // les trois canaux, sans en privilegier un. Le telephone en fait partie —
  // 1 023 fiches en portent un SANS adresse (mesure du 2026-09-02).
  const demandes = String(p.canal || "").split(",").map(c => c.trim()).filter(Boolean)
    .flatMap(c => (c === "joignable" ? Object.keys(CANAUX) : [c]))
    .filter(c => c in CANAUX);
  const uniques = [...new Set(demandes)];
  if (uniques.length) {
    w.push(uniques.length === 1 ? CANAUX[uniques[0]]
      : `(${uniques.map(c => CANAUX[c]).join(" OR ")})`);
  }

  /*
   * Le pays, en choix multiple. Les valeurs sont des codes a deux lettres
   * (FR, US, IL...) : on les filtre sur cette forme avant de les lier, une
   * valeur venue d'une requete finissant dans du SQL.
   */
  if (p.pays) {
    const codes = String(p.pays).split(",").map(c => c.trim().toUpperCase())
      .filter(c => /^[A-Z]{2}$/.test(c)).slice(0, 40);
    if (codes.length) {
      const noms = codes.map((c, i) => { binds[`pay${i}`] = c; return `:pay${i}`; });
      w.push(`COUNTRY IN (${noms.join(", ")})`);
    }
  }

  /*
   * Le type d'entreprise. L'ecran envoie des FAMILLES ; on les developpe ici en
   * etiquettes brutes, car la base en porte plusieurs pour la meme realite
   * (« Family office » et « family_office »). Une etiquette inconnue d'une
   * famille est acceptee telle quelle : la longue traine de la nomenclature
   * PACA n'a pas de famille, et doit rester filtrable.
   */
  if (p.secteur) {
    const demandes = String(p.secteur).split(",").map(x => x.trim()).filter(Boolean);
    const etiquettes = [...new Set([...variantesDe(demandes),
      ...demandes.filter(d => !variantesDe([d]).length)])].slice(0, 60);
    if (etiquettes.length) {
      const noms = etiquettes.map((e, i) => { binds[`sec${i}`] = e; return `:sec${i}`; });
      w.push(`SECTEUR IN (${noms.join(", ")})`);
    }
  }

  if (p.langues) {
    const liste = p.langues.split(",").map(l => l.trim().toLowerCase())
      .filter(l => /^[a-z]{2}$/.test(l)).slice(0, 12);
    if (liste.length) {
      const conditions = liste.map((l, i) => {
        binds[`lg${i}`] = `%,${l},%`;
        return `',' || LANGUES || ',' LIKE :lg${i}`;
      });
      w.push(`(${conditions.join(" OR ")})`);
    }
  }
  // « Langue inconnue » est un choix a part : on ne peut pas le confondre avec
  // une langue, et il compte 630 personnes joignables.
  if (p.langue_inconnue === "1") w.push(`LANGUES IS NULL`);

  return { where: w.length ? w.join(" AND ") : "1 = 1", binds };
}

/*
 * Les langues reellement presentes dans le referentiel, avec leur effectif.
 *
 * L'ecran ne propose que ce qui existe : une liste figee de vingt langues
 * dont dix-huit ne rendraient rien ferait perdre du temps a chaque usage.
 */
export const SQL_LANGUES = `
  SELECT LANGUE, COUNT(*) N FROM (
    SELECT TRIM(REGEXP_SUBSTR(LANGUES, '[^,]+', 1, niveaux.n)) LANGUE
      FROM V_PERSONNES,
           (SELECT LEVEL n FROM DUAL CONNECT BY LEVEL <= 6) niveaux
     WHERE LANGUES IS NOT NULL
       AND (EMAIL IS NOT NULL OR LINKEDIN_URL IS NOT NULL)
       AND REGEXP_SUBSTR(LANGUES, '[^,]+', 1, niveaux.n) IS NOT NULL)
   GROUP BY LANGUE ORDER BY N DESC`;
