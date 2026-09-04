import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { appelMailer, RefusMailer } from "@/lib/mailer";

/*
 * A campaign's rhythm: read the projection, or change the setting.
 *
 * GET  → when the remaining messages will leave, day by day. `cadence` and
 *        `fenetre` may be passed to project a setting BEFORE saving it, which
 *        is what makes the choice comparable rather than a guess.
 * PATCH → change the cadence and the window.
 *
 * Both go through the mailer, for two different reasons that happen to agree.
 * The app cannot write INVESTORS at all (ORA-41900), so the update has no
 * other route. And the projection depends on windows, working days and French
 * public holidays — all of it already in mailing/fenetres.py. Recomputing that
 * here would give two calendars, and the one on screen would not be the one
 * that sends.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });

  const id = String(req.query.id);
  // The 404 also covers "not your mandate": confirming that a campaign exists
  // is already telling someone something about another client's work.
  const c = (await q(`SELECT CLIENT_ID FROM INVESTORS.MAILING_CAMPAIGNS
                       WHERE CAMPAIGN_ID = :id`, { id })).rows as
    { CLIENT_ID: number | null }[];
  if (!c.length || !c[0].CLIENT_ID || !clientAutorise(p, c[0].CLIENT_ID))
    return res.status(404).json({ erreur: "campagne inconnue" });

  try {
    if (req.method === "GET") {
      const params = new URLSearchParams();
      if (req.query.cadence) params.set("cadence", String(req.query.cadence));
      if (req.query.fenetre) params.set("fenetre", String(req.query.fenetre));
      const qs = params.toString();
      return res.json(await appelMailer(
        `/projection/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`, undefined, "GET"));
    }

    if (req.method === "PATCH") {
      const { cadence_min, fenetre } = (req.body ?? {}) as
        { cadence_min?: number | null; fenetre?: string };
      // `null` puts the campaign back to manual — a setting, not the absence
      // of one, so the key must be sent even when its value is null.
      const corps: Record<string, unknown> = {};
      if (cadence_min !== undefined) corps.cadence_min = cadence_min;
      if (fenetre) corps.fenetre = fenetre;
      if (!Object.keys(corps).length)
        return res.status(400).json({ erreur: "cadence_min ou fenetre requis" });
      return res.json(await appelMailer(
        `/campaigns/${encodeURIComponent(id)}`, corps, "PATCH"));
    }
  } catch (e) {
    // A business refusal from the mailer — unknown window, cadence out of
    // range — is an answer, not a failure of this route.
    if (e instanceof RefusMailer) return res.status(422).json({ erreur: e.message });
    throw e;
  }

  res.setHeader("Allow", ["GET", "PATCH"]);
  res.status(405).end();
}
