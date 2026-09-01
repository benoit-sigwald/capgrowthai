import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { envoyerLot } from "@/lib/mailer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "envoi reserve a Arx" });
  if (req.method !== "POST") { res.setHeader("Allow", ["POST"]); return res.status(405).end(); }

  const id = String(req.query.id);
  const c = (await q(`SELECT CLIENT_ID FROM INVESTORS.MAILING_CAMPAIGNS WHERE CAMPAIGN_ID = :id`,
                     { id })).rows as { CLIENT_ID: number | null }[];
  if (!c.length || !c[0].CLIENT_ID || !clientAutorise(p, c[0].CLIENT_ID))
    return res.status(404).json({ erreur: "campagne inconnue" });

  const lot = Math.min(Number((req.body as { lot?: number })?.lot) || 20, 200);
  // Le mailer decide du plafond (chauffage par domaine) : on relaie sa reponse
  // telle quelle, compteurs compris.
  const r = await envoyerLot(id, lot);
  res.json(r);
}
