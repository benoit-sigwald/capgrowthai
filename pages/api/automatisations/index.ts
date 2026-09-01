import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";

export const DECLENCHEURS = ["reponse", "clic", "sans_reponse", "inscription", "rebond"];
export const ACTIONS = ["tache", "statut", "notifier"];

/*
 * Les regles d'un mandat.
 *
 * Une regle ne cree jamais un envoi : elle pose une tache, change un statut ou
 * notifie. Faire partir un message sans qu'un humain l'ait voulu est la facon
 * la plus rapide de bruler un domaine.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  if (req.method === "GET") {
    const r = await q(`SELECT a.ID, a.NOM, a.ACTIF, a.DECLENCHEUR, a.DELAI_JOURS, a.ACTION,
                              a.ACTION_PARAM, a.ACTION_DELAI_JOURS, a.DERNIER_PASSAGE,
                              a.DERNIER_DECLENCHE,
                              (SELECT COUNT(*) FROM AUTOMATISATION_JOURNAL j
                                WHERE j.AUTOMATISATION_ID = a.ID) TOTAL_DECLENCHE
                         FROM AUTOMATISATION a WHERE a.CLIENT_ID = :cid ORDER BY a.NOM`, { cid });
    return res.json({ rows: r.rows, declencheurs: DECLENCHEURS, actions: ACTIONS });
  }

  if (req.method === "POST") {
    const v = (req.body ?? {}) as Record<string, string | number | undefined>;
    if (!String(v.nom ?? "").trim()) return res.status(400).json({ erreur: "nom requis" });
    if (!DECLENCHEURS.includes(String(v.declencheur))) return res.status(400).json({ erreur: "declencheur inconnu" });
    if (!ACTIONS.includes(String(v.action))) return res.status(400).json({ erreur: "action inconnue" });

    await q(`MERGE INTO AUTOMATISATION a USING (SELECT :cid CID, :nom NOM FROM DUAL) s
               ON (a.CLIENT_ID = s.CID AND a.NOM = s.NOM)
             WHEN MATCHED THEN UPDATE SET DECLENCHEUR = :decl, DELAI_JOURS = :delai,
                    ACTION = :act, ACTION_PARAM = :param, ACTION_DELAI_JOURS = :adelai,
                    ACTIF = NVL(:actif, ACTIF), UPDATED_AT = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT (CLIENT_ID, NOM, DECLENCHEUR, DELAI_JOURS,
                    ACTION, ACTION_PARAM, ACTION_DELAI_JOURS, ACTIF)
               VALUES (:cid, :nom, :decl, :delai, :act, :param, :adelai, NVL(:actif, 1))`,
            { cid, nom: String(v.nom).trim(), decl: String(v.declencheur),
              delai: v.delai_jours != null ? Number(v.delai_jours) : null,
              act: String(v.action), param: v.action_param ? String(v.action_param) : null,
              adelai: v.action_delai_jours != null ? Number(v.action_delai_jours) : 7,
              actif: v.actif != null ? Number(v.actif) : null });
    return res.json({ ok: true });
  }

  if (req.method === "DELETE") {
    const id = Number((req.body as { id?: number })?.id || req.query.id);
    await q(`DELETE FROM AUTOMATISATION WHERE ID = :id AND CLIENT_ID = :cid`, { id, cid });
    return res.json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]); res.status(405).end();
}
