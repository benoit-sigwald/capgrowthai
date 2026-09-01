import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { CANAUX, TYPES_INTERACTION } from "@/lib/crm";

/*
 * Saisie d'une interaction — reservee a ce qu'aucune machine ne voit :
 * l'appel, la rencontre, la note. Envois, ouvertures, clics, reponses et
 * rebonds sont ingeres depuis le mailer ; les ressaisir ferait deux verites.
 *
 * Une saisie fait avancer l'etat du mandat : sans cela il faudrait le
 * remettre a jour a la main, et personne ne le ferait.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  if (req.method !== "POST") { res.setHeader("Allow", ["POST"]); return res.status(405).end(); }

  const { person_key, canal, type, resume, client } = (req.body ?? {}) as
    { person_key?: string; canal?: string; type?: string; resume?: string; client?: number };
  const cid = Number(client || req.query.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });
  if (!person_key) return res.status(400).json({ erreur: "person_key requis" });
  if (!CANAUX.includes(canal ?? "")) return res.status(400).json({ erreur: "canal inconnu" });
  if (!TYPES_INTERACTION.includes(type ?? "")) return res.status(400).json({ erreur: "type inconnu" });
  if (!resume?.trim()) return res.status(400).json({ erreur: "dites ce qui s'est passe" });

  const org = await q(`SELECT ORG_KEY FROM V_PERSONNES WHERE PERSON_KEY = :k`, { k: person_key });
  if (!org.rows?.length) return res.status(404).json({ erreur: "personne inconnue" });

  // SOURCE_REF horodate a la milliseconde : deux saisies restent distinctes,
  // et l'unicite ne bloque que les rejeux d'ingestion.
  await q(`INSERT INTO INTERACTION
             (PERSON_KEY, ORG_KEY, CLIENT_ID, QUAND, CANAL, TYPE, SENS, RESUME,
              ORIGINE, SOURCE_REF, AUTEUR)
           VALUES (:k, :org, :cid, SYSTIMESTAMP, :canal, :type, 'sortant', :resume,
                   'saisie', 'saisie:' || :k || ':' || TO_CHAR(SYSTIMESTAMP,'YYYYMMDDHH24MISSFF3'),
                   :auteur)`,
          { k: person_key, org: (org.rows[0] as { ORG_KEY: string }).ORG_KEY,
            cid, canal, type, resume: resume.trim(), auteur: `uid:${p.uid}` });

  await q(`MERGE INTO CONTACT_STATE c
           USING (SELECT :k PERSON_KEY, :cid CLIENT_ID FROM DUAL) s
             ON (c.PERSON_KEY = s.PERSON_KEY AND c.CLIENT_ID = s.CLIENT_ID)
           WHEN MATCHED THEN UPDATE SET DERNIER_CONTACT_LE = SYSTIMESTAMP,
                  DERNIER_CANAL = :canal, UPDATED_AT = SYSTIMESTAMP
           WHEN NOT MATCHED THEN INSERT (PERSON_KEY, CLIENT_ID, STATUT,
                  DERNIER_CONTACT_LE, DERNIER_CANAL, ORIGINE_ETAT)
             VALUES (:k, :cid, 'contacte', SYSTIMESTAMP, :canal, 'saisie')`,
          { k: person_key, cid, canal });

  const f = await q(`SELECT i.QUAND, i.CANAL, i.TYPE, i.SENS, i.RESUME, i.ORIGINE, i.AUTEUR,
                            c.NOM CAMPAGNE
                       FROM INTERACTION i LEFT JOIN CAMPAGNE c ON c.ID = i.CAMPAGNE_ID
                      WHERE i.PERSON_KEY = :k ORDER BY i.QUAND DESC`, { k: person_key });
  res.json({ ok: true, frise: f.rows });
}
