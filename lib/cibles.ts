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

/*
 * Le corps de la selection, commun au segment et a la liste : seule change la
 * facon de designer QUI. Le reste — la jointure investisseurs, la langue, le
 * format du CSV — est identique, et n'a aucune raison d'exister deux fois.
 *
 * Le filtre s'applique dans une sous-requete AVANT la jointure : V_PERSONNES et
 * INVESTORS.CONTACTS portent tous deux EMAIL, et un WHERE non qualifie leverait
 * ORA-00918.
 */
/*
 * Le routeur ne sait ecrire qu'aux contacts qu'il connait : MAILING_SENDS
 * pointe vers DEMARCHAGE par CONTACT_ID. On rapprochait donc les personnes par
 * leur cle « inv: », et toute personne venue d'une autre source etait ecartee.
 *
 * Constate le 2026-09-01 : une liste de deux personnes n'envoyait qu'un
 * e-mail. La seconde etait la MEME personne, la meme adresse, mais entree par
 * le gate — donc portant la cle « gate:50:5 » au lieu de « inv:… ». On
 * l'ecartait alors que le routeur savait parfaitement lui ecrire.
 *
 * Le rapprochement se fait desormais sur l'ADRESSE, qui est ce que le courrier
 * utilise vraiment. Une adresse portee par plusieurs fiches ne rend qu'un
 * contact — le plus recemment charge — sans quoi la meme personne recevrait
 * deux fois le meme message.
 */
const SQL_CONTACT_PAR_EMAIL = `
  SELECT CONTACT_ID, EMAIL, LANGUAGES, CLE FROM (
    SELECT c.CONTACT_ID, c.EMAIL, c.LANGUAGES, LOWER(c.EMAIL) CLE,
           ROW_NUMBER() OVER (PARTITION BY LOWER(c.EMAIL)
                              ORDER BY c.LOADED_AT DESC NULLS LAST, c.CONTACT_ID) RANG
      FROM INVESTORS.CONTACTS c WHERE c.EMAIL IS NOT NULL)
   WHERE RANG = 1`;

async function selectionner(sousRequete: string, binds: Record<string, unknown>,
                            limite?: number): Promise<Cibles> {
  /*
   * Le CONTACT_ID vient du contact rapproche, PAS de la cle de la personne :
   * MAILING_SENDS pointe vers DEMARCHAGE, un identifiant invente n'y existerait
   * pas. Et l'on ne garde qu'UNE ligne par adresse — la meme personne figure
   * jusqu'a cinq fois dans le referentiel (une par porte d'entree), elle ne
   * doit pas recevoir cinq fois le meme message.
   */
  const cibles = await q(`
    SELECT CONTACT_ID, EMAIL, FULL_NAME, COUNTRY, LANGUES FROM (
      SELECT i.CONTACT_ID, v.EMAIL,
             TRIM(NVL(v.FIRST_NAME, ' ') || ' ' || NVL(v.LAST_NAME, ' ')) FULL_NAME,
             v.COUNTRY,
             REPLACE(REPLACE(REPLACE(NVL(JSON_SERIALIZE(i.LANGUAGES), '[]'),
                     '[', ''), ']', ''), '"', '') LANGUES,
             ROW_NUMBER() OVER (PARTITION BY LOWER(v.EMAIL)
                                ORDER BY CASE WHEN v.PERSON_KEY LIKE 'inv:%' THEN 0 ELSE 1 END,
                                         v.PERSON_KEY) RANG
        FROM (${sousRequete}) v
        JOIN (${SQL_CONTACT_PAR_EMAIL}) i ON i.CLE = LOWER(v.EMAIL)
       WHERE v.EMAIL IS NOT NULL)
     WHERE RANG = 1
     FETCH FIRST ${Math.min(Number(limite) || 500, PLAFOND_CIBLES)} ROWS ONLY`, binds);
  const horsInv = await q(`SELECT COUNT(DISTINCT LOWER(v.EMAIL)) N FROM (${sousRequete}) v
     WHERE v.EMAIL IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM INVESTORS.CONTACTS c
                        WHERE LOWER(c.EMAIL) = LOWER(v.EMAIL))`, binds);

  const lignes = cibles.rows as { CONTACT_ID: string; EMAIL: string; FULL_NAME: string;
    COUNTRY: string | null; LANGUES: string }[];
  const csv = ["contact_id;email;full_name;country;languages"]
    .concat(lignes.map(l => [l.CONTACT_ID, l.EMAIL, l.FULL_NAME, l.COUNTRY ?? "", l.LANGUES]
      .map(x => String(x ?? "").replace(/;/g, ",")).join(";")))
    .join("\n");

  return { csv, nombre: lignes.length,
           horsInvestisseurs: (horsInv.rows as { N: number }[])[0].N };
}

/*
 * Un SEGMENT est un critere, rejoue maintenant : sur un referentiel qui bouge
 * tous les jours, il rend l'etat du jour.
 */
export async function ciblesDuSegment(segmentId: number, cid: number,
                                      limite?: number): Promise<Cibles | null> {
  const seg = (await q(`SELECT CLIENT_ID, FILTRE FROM LISTE WHERE ID = :id`, { id: segmentId }))
    .rows as { CLIENT_ID: number; FILTRE: string }[];
  if (!seg.length || seg[0].CLIENT_ID !== cid) return null;
  const { where, binds } = construireFiltre(JSON.parse(seg[0].FILTRE));
  return selectionner(`SELECT * FROM V_PERSONNES WHERE ${where}`, binds, limite);
}

/*
 * Une LISTE est un ensemble fige : ce qu'on y a mis, et rien d'autre. C'est le
 * choix a faire quand la selection a ete pesee a la main et ne doit plus
 * bouger — une liste de comptes cles, une vague preparee avec le client.
 */
export async function ciblesDeLaListe(listeId: number, cid: number,
                                      limite?: number): Promise<Cibles | null> {
  const l = (await q(`SELECT CLIENT_ID FROM CONTACT_LISTE WHERE ID = :lid`, { lid: listeId }))
    .rows as { CLIENT_ID: number }[];
  if (!l.length || l[0].CLIENT_ID !== cid) return null;
  return selectionner(
    `SELECT p.* FROM V_PERSONNES p
       JOIN CONTACT_LISTE_MEMBRE m ON m.PERSON_KEY = p.PERSON_KEY
      WHERE m.LISTE_ID = :lid`, { lid: listeId }, limite);
}
