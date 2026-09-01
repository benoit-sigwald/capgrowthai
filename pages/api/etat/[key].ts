import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { STATUTS, TYPES_ACTION, MOTIFS_PERTE, SQL_PIPELINE } from "@/lib/crm";

/*
 * Changement d'etat, par mandat.
 *
 * Le formulaire n'impose pas la prochaine action : c'est la contrainte
 * CK_CS_ACTION_DUE qui la refuse. Une seule regle, un seul endroit ou elle est
 * ecrite — et son refus est traduit en francais plutot que rendu en ORA-02290.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  if (req.method !== "PATCH") { res.setHeader("Allow", ["PATCH"]); return res.status(405).end(); }

  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  const k = String(req.query.key);
  const v = (req.body ?? {}) as Record<string, string | null>;
  if (v.statut && !STATUTS.includes(v.statut as never))
    return res.status(400).json({ erreur: `statut inconnu : ${v.statut}` });
  if (v.action_type && !TYPES_ACTION.includes(v.action_type))
    return res.status(400).json({ erreur: `type d'action inconnu` });
  if (v.motif_perte && !MOTIFS_PERTE.includes(v.motif_perte))
    return res.status(400).json({ erreur: `motif de perte inconnu` });

  // Une cle inventee creerait un etat orphelin que plus rien ne rattacherait
  // a quelqu'un.
  const existe = await q(`SELECT COUNT(*) N FROM V_PERSONNES WHERE PERSON_KEY = :k`, { k });
  if (!(existe.rows as { N: number }[])[0].N)
    return res.status(404).json({ erreur: "personne inconnue" });

  try {
    await q(`MERGE INTO CONTACT_STATE c
             USING (SELECT :k PERSON_KEY, :cid CLIENT_ID FROM DUAL) s
               ON (c.PERSON_KEY = s.PERSON_KEY AND c.CLIENT_ID = s.CLIENT_ID)
             WHEN MATCHED THEN UPDATE SET
               STATUT = NVL(:statut, STATUT),
               PROPRIETAIRE = NVL(:prop, PROPRIETAIRE),
               ACTION_TYPE = NVL(:atype, ACTION_TYPE),
               ACTION_LE = NVL(TO_DATE(:ale, 'YYYY-MM-DD'), ACTION_LE),
               ACTION_NOTE = NVL(:anote, ACTION_NOTE),
               NOTES = NVL(:notes, NOTES),
               MOTIF_PERTE = NVL(:motif, MOTIF_PERTE),
               UPDATED_AT = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT
               (PERSON_KEY, CLIENT_ID, STATUT, PROPRIETAIRE, ACTION_TYPE, ACTION_LE,
                ACTION_NOTE, NOTES, MOTIF_PERTE, ORIGINE_ETAT)
               VALUES (:k, :cid, NVL(:statut, 'a_contacter'), :prop, :atype,
                       TO_DATE(:ale, 'YYYY-MM-DD'), :anote, :notes, :motif, 'saisie')`,
            { k, cid, statut: v.statut || null, prop: v.proprietaire || null,
              atype: v.action_type || null, ale: v.action_le || null,
              anote: v.action_note || null, notes: v.notes || null,
              motif: v.motif_perte || null });
  } catch (e) {
    if (String((e as Error).message).includes("CK_CS_ACTION_DUE"))
      return res.status(400).json({
        erreur: "Ce statut exige une prochaine action datée : renseignez le type et la date." });
    throw e;
  }

  const r = await q(`SELECT * FROM (${SQL_PIPELINE}) WHERE PERSON_KEY = :k`, { cid, k });
  res.json({ ok: true, fiche: r.rows?.[0] ?? null });
}
