import type { NextApiRequest, NextApiResponse } from "next";
import Papa from "papaparse";
import { q, qLot, oracledb } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { exigerAdmin } from "@/lib/portee";

/*
 * Import CSV — admin seulement : un fichier verse dans le referentiel partage
 * pollue tous les mandats s'il est mauvais.
 *
 * Colonnes reconnues : email (obligatoire), prenom, nom, titre, societe,
 * telephone, linkedin, ville, pays. Dedoublonnage par e-mail : une adresse
 * deja connue est ignoree — l'import n'ecrase JAMAIS l'existant, et encore
 * moins une saisie manuelle.
 *
 * Sans ?applique=1 : simulation, rien n'est ecrit.
 */
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!exigerAdmin(p)) return res.status(403).json({ erreur: "import reserve a l'administrateur" });
  if (req.method !== "POST") { res.setHeader("Allow", ["POST"]); return res.status(405).end(); }

  const csv = typeof req.body === "string" ? req.body : (req.body as { csv?: string })?.csv;
  if (!csv?.trim()) return res.status(400).json({ erreur: "csv requis" });

  const parse = Papa.parse<Record<string, string>>(csv, {
    header: true, skipEmptyLines: true,
    transformHeader: h => h.trim().toLowerCase(),
  });
  const lignes = parse.data
    .map(l => ({ email: (l.email || "").trim().toLowerCase(), prenom: l.prenom || null,
      nom: l.nom || null, titre: l.titre || null, societe: l.societe || null,
      telephone: l.telephone || null, linkedin: l.linkedin || null,
      ville: l.ville || null, pays: (l.pays || "").toUpperCase() || null }))
    .filter(l => RE_EMAIL.test(l.email));

  const existants = new Set<string>();
  const emails = lignes.map(l => l.email);
  for (let i = 0; i < emails.length; i += 500) {
    const lot = emails.slice(i, i + 500);
    const binds: Record<string, string> = {};
    lot.forEach((e, n) => { binds[`e${n}`] = e; });
    const r = await q(`SELECT LOWER(EMAIL) E FROM INVESTORS.CONTACTS
                        WHERE LOWER(EMAIL) IN (${lot.map((_, n) => `:e${n}`).join(",")})`, binds);
    (r.rows as { E: string }[]).forEach(x => existants.add(x.E));
  }
  const nouveaux = lignes.filter(l => !existants.has(l.email));

  if (req.query.applique !== "1") {
    return res.json({ simulation: true, lignes_lues: parse.data.length,
      valides: lignes.length, deja_connus: lignes.length - nouveaux.length,
      a_inserer: nouveaux.length });
  }

  const S = (n: number) => ({ type: oracledb.STRING, maxSize: n });
  await qLot(`INSERT INTO INVESTORS.CONTACTS
      (CONTACT_ID, FULL_NAME, FIRST_NAME, LAST_NAME, JOB_TITLE, ORG_NAME,
       EMAIL, PHONE, LINKEDIN_URL, CITY, COUNTRY,
       SOURCES, LEGAL_BASIS, LOADED_AT)
    VALUES (:email, TRIM(NVL(:prenom,' ') || ' ' || NVL(:nom,' ')), :prenom, :nom, :titre, :societe,
            :email, :telephone, :linkedin, :ville, :pays,
            '["MANUAL/Import"]', 'legitimate_interest_b2b', SYSTIMESTAMP)`,
    nouveaux,
    { email: S(320), prenom: S(120), nom: S(200), titre: S(400), societe: S(600),
      telephone: S(24), linkedin: S(500), ville: S(160), pays: S(2) });
  res.json({ simulation: false, inseres: nouveaux.length,
             deja_connus: lignes.length - nouveaux.length });
}
