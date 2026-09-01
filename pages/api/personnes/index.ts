import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { contactsAutorises } from "@/lib/portee";
import { construireFiltre } from "@/lib/personnes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "le referentiel est reserve a Arx" });
  res.setHeader("Cache-Control", "no-store");

  const params = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, String(v ?? "")]));
  const { where, binds } = construireFiltre(params);
  const off = Number(params.page || 0) * 60;

  const r = await q(`SELECT PERSON_KEY, SOURCE, FIRST_NAME, LAST_NAME, EMAIL, LINKEDIN_URL,
                            TITLE, COMPANY, CITY, COUNTRY, PHONE, TERRITOIRE, SECTEUR, OPT_OUT
                       FROM V_PERSONNES WHERE ${where}
                      ORDER BY LAST_NAME, FIRST_NAME
                      OFFSET :off ROWS FETCH NEXT 60 ROWS ONLY`, { ...binds, off });
  const c = await q(`SELECT COUNT(*) N FROM V_PERSONNES WHERE ${where}`, binds);
  res.json({ total: (c.rows as { N: number }[])[0].N, rows: r.rows });
}
