import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { SQL_PIPELINE } from "@/lib/crm";

/*
 * Les taches : trois listes courtes, dans l'ordre du cout d'un oubli.
 *
 * Une reponse qui attend coute une affaire, un retard coute une relance, une
 * echeance du jour ne coute encore rien. C'est cet ordre qui fait la valeur de
 * l'ecran — pas la longueur des listes.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });
  res.setHeader("Cache-Control", "no-store");

  // Par defaut chacun voit les siennes ; l'admin peut demander la vue equipe.
  const equipe = req.query.equipe === "1" && p.role === "admin";
  const mien = equipe ? `` : `AND (PROPRIETAIRE = :prop OR PROPRIETAIRE IS NULL)`;
  const b: Record<string, unknown> = { cid, ...(equipe ? {} : { prop: String(p.uid) }) };

  const file = (cond: string) => `SELECT * FROM (${SQL_PIPELINE})
      WHERE ${cond} ${mien} ORDER BY ACTION_LE NULLS LAST, LAST_NAME
      FETCH FIRST 50 ROWS ONLY`;

  const [reponses, retard, dues, semaine] = await Promise.all([
    q(file(`STATUT = 'a_repondu' AND OPT_OUT = 0`), b),
    q(file(`ACTION_LE < TRUNC(SYSDATE) AND STATUT <> 'a_repondu'`), b),
    q(file(`ACTION_LE = TRUNC(SYSDATE) AND STATUT <> 'a_repondu'`), b),
    q(file(`ACTION_LE > TRUNC(SYSDATE) AND ACTION_LE <= TRUNC(SYSDATE) + 7`), b),
  ]);
  res.json({ equipe, reponses: reponses.rows, retard: retard.rows,
             dues: dues.rows, semaine: semaine.rows });
}
