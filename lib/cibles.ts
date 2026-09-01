import { q } from "./oracle";
import { construireFiltre } from "./personnes";

/*
 * Cibles d'une campagne, au format que le mailer sait lire.
 *
 * Extrait de pages/api/campagnes/index.ts le 2026-09-01 : creer une campagne
 * et completer une campagne existante posent exactement la meme question — qui
 * part, sous quelle langue. Deux implantations de cette question, ce serait
 * deux ciblages qui divergent en silence.
 *
 * Seuls les contacts investisseurs partent : ce sont eux qui portent langue et
 * demarchage, et le mailer les reconnait par CONTACT_ID. Les autres sources
 * sont comptees et dites, pas oubliees.
 */
export const PLAFOND_CIBLES = 2000;

export interface Cibles { csv: string; nombre: number; horsInvestisseurs: number }

export async function ciblesDuSegment(segmentId: number, cid: number,
                                      limite?: number): Promise<Cibles | null> {
  const seg = (await q(`SELECT CLIENT_ID, FILTRE FROM LISTE WHERE ID = :id`, { id: segmentId }))
    .rows as { CLIENT_ID: number; FILTRE: string }[];
  if (!seg.length || seg[0].CLIENT_ID !== cid) return null;
  const { where, binds } = construireFiltre(JSON.parse(seg[0].FILTRE));

  // Le filtre du segment s'applique dans une sous-requete AVANT la jointure :
  // V_PERSONNES et INVESTORS.CONTACTS portent tous deux EMAIL, et un WHERE non
  // qualifie leverait ORA-00918.
  const cibles = await q(`
    SELECT SUBSTR(v.PERSON_KEY, 5) CONTACT_ID, v.EMAIL,
           TRIM(NVL(v.FIRST_NAME, ' ') || ' ' || NVL(v.LAST_NAME, ' ')) FULL_NAME,
           v.COUNTRY,
           REPLACE(REPLACE(REPLACE(NVL(JSON_SERIALIZE(i.LANGUAGES), '[]'),
                   '[', ''), ']', ''), '"', '') LANGUES
      FROM (SELECT * FROM V_PERSONNES WHERE ${where}) v
      JOIN INVESTORS.CONTACTS i ON 'inv:' || i.CONTACT_ID = v.PERSON_KEY
     WHERE v.PERSON_KEY LIKE 'inv:%' AND v.EMAIL IS NOT NULL
     FETCH FIRST ${Math.min(Number(limite) || 500, PLAFOND_CIBLES)} ROWS ONLY`, binds);
  const horsInv = await q(`SELECT COUNT(*) N FROM (SELECT * FROM V_PERSONNES WHERE ${where}) v
     WHERE v.PERSON_KEY NOT LIKE 'inv:%' AND v.EMAIL IS NOT NULL`, binds);

  const lignes = cibles.rows as { CONTACT_ID: string; EMAIL: string; FULL_NAME: string;
    COUNTRY: string | null; LANGUES: string }[];
  const csv = ["contact_id;email;full_name;country;languages"]
    .concat(lignes.map(l => [l.CONTACT_ID, l.EMAIL, l.FULL_NAME, l.COUNTRY ?? "", l.LANGUES]
      .map(x => String(x ?? "").replace(/;/g, ",")).join(";")))
    .join("\n");

  return { csv, nombre: lignes.length,
           horsInvestisseurs: (horsInv.rows as { N: number }[])[0].N };
}
