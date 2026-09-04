import type { NextApiRequest, NextApiResponse } from "next";
import { porteeDepuis } from "@/lib/auth";
import { contactsAutorises } from "@/lib/portee";
import { appelMailer } from "@/lib/mailer";

/*
 * The sending windows offered on the campaign screen.
 *
 * Proxied from the mailer rather than restated here. The mailer is what
 * actually decides whether a message leaves; a second copy of the list on this
 * side would drift at the first change, and the screen would then offer a
 * window the scheduler cannot read — silently, since an unknown window is
 * refused only at save time.
 *
 * The response also carries the sender's current local time and which windows
 * are open right now, so the screen can say "opens Monday at 09:00" instead of
 * leaving someone to work it out.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  if (req.method !== "GET") { res.setHeader("Allow", ["GET"]); return res.status(405).end(); }

  res.json(await appelMailer("/fenetres", undefined, "GET"));
}
