import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { appelMailer, RefusMailer } from "@/lib/mailer";

/*
 * Les reponses recues, et la reponse qu'on y fait.
 *
 * Une reponse est le seul evenement d'une campagne qui demande quelque chose :
 * une ouverture se compte, une reponse s'honore. Elle vivait pourtant dans une
 * colonne que rien n'affichait — REPLY_SNIPPET, remplie par la relecture de la
 * boite d'envoi.
 *
 * L'envoi passe par le routeur, sous l'adresse de la CAMPAGNE : le contact a
 * ecrit a quelqu'un, la reponse vient de la meme personne.
 */
/*
 * Bloc de signature d'un expediteur.
 *
 * Compose ici, ligne a ligne, et jamais par le modele : une signature contient
 * un telephone et une adresse. Un modele qui « redige une signature » invente
 * un chiffre plausible, et personne ne le verifie avant l'envoi.
 */
export function signatureDe(e: Record<string, string | null>) {
  const nom = [e.PRENOM, e.NOM].filter(Boolean).join(" ").trim() || e.NOM_AFFICHAGE || "";
  return [
    nom,
    e.FONCTION,
    e.SOCIETE,
    e.ADRESSE,
    e.EMAIL,
    e.TELEPHONE,
    e.SITE,
  ].map(l => (l || "").trim()).filter(Boolean).join("\n");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  if (req.method === "GET") {
    const r = await q(`
      SELECT s.SEND_ID, s.EMAIL, s.REPLIED_AT, s.RENDERED_SUBJECT, s.REPLY_SNIPPET,
             s.STATUS, s.EXPEDITEUR_EMAIL, c.NAME CAMPAGNE, c.CAMPAIGN_ID,
             -- Le message d'origine : sans lui, on repond a une reponse sans
             -- savoir a quoi elle repond, et le modele non plus.
             s.SENT_AT, s.RENDERED_BODY MESSAGE_ENVOYE, s.LANGUAGE LANGUE_ENVOI,
             v.FIRST_NAME, v.LAST_NAME, v.COMPANY, v.PERSON_KEY, v.LANGUES,
             x.PRENOM, x.NOM, x.FONCTION, x.SOCIETE, x.ADRESSE, x.TELEPHONE, x.SITE,
             x.NOM_AFFICHAGE,
             CASE WHEN c.CLIENT_ID IS NULL THEN 1 ELSE 0 END HORS_MANDAT,
             -- Ce qu'on a deja repondu, s'il y a lieu : sans cela on repond deux
             -- fois. Et le TEXTE de cette reponse, sans quoi l'ecran dit qu'on a
             -- repondu sans dire quoi — ce qui oblige a rouvrir sa messagerie.
             (SELECT MAX(i.QUAND) FROM INTERACTION i
               WHERE i.SOURCE_REF LIKE 'reponse:' || s.SEND_ID || '%'
                 AND i.SENS = 'sortant') REPONDU_LE
        FROM INVESTORS.MAILING_SENDS s
        JOIN INVESTORS.MAILING_CAMPAIGNS c ON c.CAMPAIGN_ID = s.CAMPAIGN_ID
        LEFT JOIN V_PERSONNES v ON LOWER(v.EMAIL) = LOWER(s.EMAIL)
                               AND v.PERSON_KEY LIKE 'inv:%'
        LEFT JOIN EXPEDITEUR x ON LOWER(x.EMAIL) = LOWER(s.EXPEDITEUR_EMAIL)
       /*
        * Les campagnes anterieures au multi-mandat portent un CLIENT_ID nul.
        * Les filtrer purement et simplement faisait disparaitre cinq reponses
        * reelles sans un mot (mesure du 2026-09-02). Un administrateur les
        * voit, marquees ; un compte de mandat ne voit que les siennes, car
        * rien ne dit a qui ces campagnes appartenaient.
        */
       WHERE s.REPLIED_AT IS NOT NULL
         AND (c.CLIENT_ID = :cid OR (c.CLIENT_ID IS NULL AND :admin = 1))
       ORDER BY s.REPLIED_AT DESC
       FETCH FIRST 200 ROWS ONLY`, { cid, admin: p.role === "admin" ? 1 : 0 });

    /*
     * TOUTES les reponses envoyees, pas seulement la derniere.
     *
     * On repond parfois deux fois a la meme personne — pour ajouter un
     * document, pour corriger. L'ecran montrait la premiere et taisait les
     * suivantes ; c'est ce qui a fait croire a une reponse perdue.
     */
    const envoyees = await q(`
      SELECT SUBSTR(i.SOURCE_REF, 9, 24) SEND_ID, i.QUAND, i.RESUME, i.AUTEUR
        FROM INTERACTION i
       WHERE i.SOURCE_REF LIKE 'reponse:%' AND i.SENS = 'sortant'
         AND (i.CLIENT_ID = :cid OR (i.CLIENT_ID IS NULL AND :admin = 1))
       ORDER BY i.QUAND`, { cid, admin: p.role === "admin" ? 1 : 0 });
    return res.json({ rows: r.rows, envoyees: envoyees.rows });
  }

  if (req.method === "POST") {
    const { send_id, corps, sujet, pieces, signature } = (req.body ?? {}) as
      { send_id?: string; corps?: string; sujet?: string; signature?: string;
        pieces?: { nom: string; contenu: string }[] };
    if (!send_id || !corps?.trim())
      return res.status(400).json({ erreur: "send_id et corps requis" });

    /*
     * Le poids des pieces jointes se verifie ICI aussi, avant de traverser le
     * reseau interne : Next refuse par defaut un corps de plus de 1 Mo, et un
     * refus a ce niveau-la se lit « erreur serveur » sans autre explication.
     */
    const poids = (pieces || []).reduce((n, p) => n + (p.contenu?.length || 0) * 0.75, 0);
    if (poids > 9_500_000)
      return res.status(413).json({ erreur: "pièces jointes trop lourdes : 9,5 Mo au total au plus" });

    // L'envoi doit appartenir a ce mandat : un send_id se devine.
    const v = await q(`SELECT s.EMAIL, c.CLIENT_ID FROM INVESTORS.MAILING_SENDS s
                       JOIN INVESTORS.MAILING_CAMPAIGNS c ON c.CAMPAIGN_ID = s.CAMPAIGN_ID
                       WHERE s.SEND_ID = :s`, { s: send_id });
    const l = (v.rows as { EMAIL: string; CLIENT_ID: number | null }[])[0];
    const sien = l && (l.CLIENT_ID === cid || (l.CLIENT_ID === null && p.role === "admin"));
    if (!sien) return res.status(404).json({ erreur: "réponse inconnue" });

    let envoi;
    try {
      envoi = await appelMailer("/repondre",
        { send_id, corps, sujet, pieces, signature }) as Record<string, string>;
    } catch (e) {
      if (e instanceof RefusMailer) return res.status(422).json({ erreur: e.message });
      throw e;
    }

    /*
     * La trace dans le CRM. SOURCE_REF porte le send_id : c'est ce qui permet
     * de savoir qu'on a deja repondu, et d'empecher la reconciliation de
     * dupliquer la frise au passage suivant.
     */
    const cle = (await q(`SELECT PERSON_KEY FROM V_PERSONNES
                           WHERE LOWER(EMAIL) = LOWER(:e) AND PERSON_KEY LIKE 'inv:%'
                           FETCH FIRST 1 ROWS ONLY`, { e: l.EMAIL }))
                .rows as { PERSON_KEY: string }[];
    if (cle.length) {
      /*
       * Une ligne PAR reponse, pas une par message.
       *
       * La cle etait « reponse:<envoi> » et le MERGE n'inserait que la
       * premiere : repondre une seconde fois envoyait bien l'e-mail mais ne
       * laissait aucune trace — ni a l'ecran, ni dans le CRM. L'horodatage
       * rend la reference unique tout en gardant le prefixe, sur lequel se
       * lit « a-t-on deja repondu ».
       */
      await q(`INSERT INTO INTERACTION
                 (PERSON_KEY, QUAND, CANAL, TYPE, SENS, RESUME, ORIGINE, SOURCE_REF,
                  AUTEUR, CLIENT_ID)
               VALUES (:pk, SYSTIMESTAMP, 'email', 'message', 'sortant', :resume,
                       'capgrowth', :ref, :qui, :cid)`,
              { ref: `reponse:${send_id}:${Date.now()}`, pk: cle[0].PERSON_KEY,
                resume: corps.trim().slice(0, 400), qui: `uid:${p.uid}`, cid });
    }
    return res.json({ ok: true, ...envoi });
  }

  res.setHeader("Allow", ["GET", "POST"]); res.status(405).end();
}
