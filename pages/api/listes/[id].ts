import type { NextApiRequest, NextApiResponse } from "next";
import { q, qLot, oracledb } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { construireFiltre } from "@/lib/personnes";

const PLAFOND_AJOUT = 5000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const id = Number(req.query.id);
  const l = await q(`SELECT ID, CLIENT_ID, NOM, NOTES FROM CONTACT_LISTE WHERE ID = :id`, { id });
  const liste = (l.rows as { ID: number; CLIENT_ID: number; NOM: string; NOTES: string }[])[0];
  if (!liste || !clientAutorise(p, liste.CLIENT_ID)) return res.status(404).json({ erreur: "liste inconnue" });
  const corps = (req.body ?? {}) as {
    person_keys?: string[]; filtre?: Record<string, string>;
    nom?: string; notes?: string; supprimer_liste?: boolean };

  if (req.method === "GET") {
    const r = await q(`SELECT m.PERSON_KEY, m.AJOUTE_LE, v.FIRST_NAME, v.LAST_NAME, v.EMAIL,
                              v.COMPANY, v.SOURCE, v.LANGUES, v.OPT_OUT
                         FROM CONTACT_LISTE_MEMBRE m
                         JOIN V_PERSONNES v ON v.PERSON_KEY = m.PERSON_KEY
                        WHERE m.LISTE_ID = :id ORDER BY v.LAST_NAME, v.FIRST_NAME`, { id });
    return res.json({ liste, rows: r.rows });
  }

  // Renommer, annoter.
  if (req.method === "PATCH") {
    if (!corps.nom?.trim()) return res.status(400).json({ erreur: "nom requis" });
    try {
      await q(`UPDATE CONTACT_LISTE SET NOM = :nom, NOTES = :notes WHERE ID = :id`,
              { nom: corps.nom.trim(), notes: corps.notes ?? liste.NOTES ?? null, id });
    } catch (e) {
      if (String((e as Error).message).includes("UQ_CONTACT_LISTE"))
        return res.status(409).json({ erreur: "une liste de ce mandat porte deja ce nom" });
      throw e;
    }
    return res.json({ ok: true });
  }

  const bindsMembre = { id: { type: oracledb.NUMBER },
                        k: { type: oracledb.STRING, maxSize: 620 } };

  if (req.method === "POST") {
    let cles = corps.person_keys;

    /*
     * Ajout en masse par filtre.
     *
     * Le navigateur envoie le CRITERE, pas 3 879 identifiants : c'est le
     * serveur qui le rejoue. Faire transiter la selection entiere par le
     * reseau serait lent, fragile, et donnerait a l'ecran le pouvoir de
     * designer des lignes qu'il n'a pas le droit de voir.
     */
    if (!cles && corps.filtre) {
      const { where, binds } = construireFiltre(corps.filtre);
      const r = await q(`SELECT PERSON_KEY FROM V_PERSONNES WHERE ${where}
                          FETCH FIRST ${PLAFOND_AJOUT} ROWS ONLY`, binds);
      cles = (r.rows as { PERSON_KEY: string }[]).map(x => x.PERSON_KEY);
    }
    if (!Array.isArray(cles) || !cles.length)
      return res.status(400).json({ erreur: "person_keys ou filtre requis" });

    const avant = await q(`SELECT COUNT(*) N FROM CONTACT_LISTE_MEMBRE WHERE LISTE_ID = :id`, { id });
    // MERGE : re-ajouter un membre present est un non-evenement.
    for (let i = 0; i < cles.length; i += 500) {
      await qLot(`MERGE INTO CONTACT_LISTE_MEMBRE m
                  USING (SELECT :id LISTE_ID, :k PERSON_KEY FROM DUAL) s
                    ON (m.LISTE_ID = s.LISTE_ID AND m.PERSON_KEY = s.PERSON_KEY)
                  WHEN NOT MATCHED THEN INSERT (LISTE_ID, PERSON_KEY) VALUES (:id, :k)`,
        cles.slice(i, i + 500).map(k => ({ id, k })), bindsMembre);
    }
    const apres = await q(`SELECT COUNT(*) N FROM CONTACT_LISTE_MEMBRE WHERE LISTE_ID = :id`, { id });
    const n = (x: { rows?: unknown[] }) => ((x.rows as { N: number }[])[0]).N;
    return res.json({ ok: true, demandes: cles.length,
                      ajoutes: n(apres) - n(avant), total: n(apres),
                      plafond_atteint: cles.length >= PLAFOND_AJOUT });
  }

  if (req.method === "DELETE") {
    // Sans corps : on supprime la liste. Avec des cles : on en retire des
    // membres. Le drapeau explicite evite de vider une liste en croyant la
    // supprimer, et l'inverse.
    if (corps.supprimer_liste) {
      await q(`DELETE FROM CONTACT_LISTE WHERE ID = :id`, { id });
      return res.json({ ok: true, liste_supprimee: true });
    }
    if (!Array.isArray(corps.person_keys) || !corps.person_keys.length)
      return res.status(400).json({ erreur: "person_keys requis, ou supprimer_liste: true" });
    for (let i = 0; i < corps.person_keys.length; i += 500) {
      await qLot(`DELETE FROM CONTACT_LISTE_MEMBRE WHERE LISTE_ID = :id AND PERSON_KEY = :k`,
        corps.person_keys.slice(i, i + 500).map(k => ({ id, k })), bindsMembre);
    }
    const reste = await q(`SELECT COUNT(*) N FROM CONTACT_LISTE_MEMBRE WHERE LISTE_ID = :id`, { id });
    return res.json({ ok: true, retires: corps.person_keys.length,
                      total: (reste.rows as { N: number }[])[0].N });
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]); res.status(405).end();
}
