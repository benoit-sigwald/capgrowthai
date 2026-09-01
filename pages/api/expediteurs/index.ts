import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise } from "@/lib/portee";
import { creerSenderBrevo } from "@/lib/mailer";
import { verifierExpediteur } from "@/lib/expediteurs";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  const mode = (await q(`SELECT MODE_EXPEDITEUR FROM CLIENT WHERE ID = :cid`, { cid }))
    .rows as { MODE_EXPEDITEUR: string }[];
  if (!mode.length) return res.status(404).json({ erreur: "mandat inconnu" });
  const modeExp = mode[0].MODE_EXPEDITEUR;

  if (req.method === "GET") {
    // En mode « utilisateur », chacun ne voit que ses adresses — l'admin voit tout.
    const filtreProprio = modeExp === "utilisateur" && p.role !== "admin"
      ? `AND (UTILISATEUR_ID = :uid OR UTILISATEUR_ID IS NULL)` : ``;
    const r = await q(`SELECT ID, EMAIL, NOM_AFFICHAGE, DOMAINE, UTILISATEUR_ID,
                              BREVO_ID, SPF_OK, DKIM_OK, VERIFIE_LE
                         FROM EXPEDITEUR WHERE CLIENT_ID = :cid ${filtreProprio}
                        ORDER BY EMAIL`,
                      filtreProprio ? { cid, uid: p.uid } : { cid });
    return res.json({ mode: modeExp, rows: r.rows });
  }

  if (req.method === "POST") {
    const { email, nom } = (req.body ?? {}) as { email?: string; nom?: string };
    const adresse = email?.trim().toLowerCase();
    if (!adresse || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(adresse) || !nom?.trim())
      return res.status(400).json({ erreur: "email valide et nom requis" });

    // Mode « utilisateur » : l'adresse appartient a celui qui la cree.
    // Mode « mandat » : elle appartient au mandat, personne en particulier.
    const uid = modeExp === "utilisateur" ? p.uid : null;

    // Declaration chez Brevo d'abord : si Brevo refuse, rien n'entre en base.
    let brevoId: number | null = null;
    try {
      const b = await creerSenderBrevo(adresse, nom.trim());
      brevoId = (b as { id?: number }).id ?? null;
    } catch (e) {
      // Un sender deja declare chez Brevo n'est pas une erreur : on le retrouve.
      const msg = String((e as Error).message);
      if (!/already|exist/i.test(msg)) return res.status(502).json({ erreur: `Brevo : ${msg}` });
    }

    await q(`MERGE INTO EXPEDITEUR e USING (SELECT :cid CID, :em EM FROM DUAL) s
               ON (e.CLIENT_ID = s.CID AND e.EMAIL = s.EM)
             WHEN MATCHED THEN UPDATE SET NOM_AFFICHAGE = :nom, BREVO_ID = NVL(:bid, BREVO_ID)
             WHEN NOT MATCHED THEN INSERT (CLIENT_ID, UTILISATEUR_ID, EMAIL, NOM_AFFICHAGE, DOMAINE, BREVO_ID)
               VALUES (:cid, :uid, :em, :nom, :dom, :bid)`,
            { cid, uid, em: adresse, nom: nom.trim(),
              dom: adresse.split("@")[1], bid: brevoId });

    const id = (await q(`SELECT ID FROM EXPEDITEUR WHERE CLIENT_ID = :cid AND EMAIL = :em`,
                        { cid, em: adresse })).rows as { ID: number }[];
    // Verification DNS immediate : l'ecran affiche tout de suite ce qui manque.
    const verdict = await verifierExpediteur(id[0].ID);
    return res.json({ ok: true, id: id[0].ID, verdict });
  }

  res.setHeader("Allow", ["GET", "POST"]); res.status(405).end();
}
