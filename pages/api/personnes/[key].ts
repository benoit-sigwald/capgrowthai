import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { contactsAutorises, exigerAdmin } from "@/lib/portee";
import { resoudreSource, CHAMPS_GENERIQUES, ChampGenerique } from "@/lib/personnes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "le referentiel est reserve a Arx" });
  res.setHeader("Cache-Control", "no-store");
  const k = String(req.query.key);

  if (req.method === "GET") {
    const f = await q(`SELECT * FROM V_PERSONNES WHERE PERSON_KEY = :k`, { k });
    if (!f.rows?.length) return res.status(404).json({ erreur: "personne inconnue" });
    const fiche = f.rows[0] as Record<string, unknown>;
    const clientId = Number(req.query.client || 0);
    const [org, frise, enr, attrs] = await Promise.all([
      fiche.ORG_KEY
        ? q(`SELECT * FROM V_ORGANISATIONS WHERE ORG_KEY = :o`, { o: fiche.ORG_KEY })
        : Promise.resolve({ rows: [] as unknown[] }),
      q(`SELECT i.QUAND, i.CANAL, i.TYPE, i.SENS, i.RESUME, i.ORIGINE, i.AUTEUR, c.NOM CAMPAGNE
           FROM INTERACTION i LEFT JOIN CAMPAGNE c ON c.ID = i.CAMPAGNE_ID
          WHERE i.PERSON_KEY = :k ORDER BY i.QUAND DESC`, { k }),
      // La provenance de chaque champ : qui a dit quoi, quand. C'est ce qui
      // permet a l'import de ne jamais ecraser une saisie humaine.
      q(`SELECT CHAMP, VALEUR, SOURCE, CONFIANCE, VU_LE FROM ENRICHISSEMENT
          WHERE CIBLE = :k ORDER BY VU_LE DESC`, { k }),
      clientId
        ? q(`SELECT a.ID, a.NOM, a.TYPE, v.VALEUR FROM ATTRIBUT_LIBRE a
              LEFT JOIN ATTRIBUT_VALEUR v ON v.ATTRIBUT_ID = a.ID AND v.PERSON_KEY = :k
             WHERE a.CLIENT_ID = :cid ORDER BY a.NOM`, { k, cid: clientId })
        : Promise.resolve({ rows: [] as unknown[] }),
    ]);
    return res.json({ fiche, organisation: org.rows?.[0] ?? null,
                      frise: frise.rows, enrichissements: enr.rows, attributs: attrs.rows });
  }

  if (req.method === "PATCH") {
    const { champ, valeur } = (req.body ?? {}) as { champ?: ChampGenerique; valeur?: string };
    if (!champ || !CHAMPS_GENERIQUES.includes(champ))
      return res.status(400).json({ erreur: `champ inconnu : ${champ}` });
    const cible = resoudreSource(k);
    if (!cible) return res.status(422).json({ erreur: "fiche non modifiable : le dirigeant se corrige sur la fiche entreprise" });
    const col = cible.colonnes[champ];
    if (!col) return res.status(422).json({ erreur: `ce champ ne se modifie pas sur cette source` });

    const v = valeur?.trim() || null;
    const r = await q(`UPDATE ${cible.table} SET ${col} = :v WHERE ${cible.cle} = :id`,
                      { v, id: cible.valeurCle });
    if (!r.rowsAffected) return res.status(404).json({ erreur: "ligne source introuvable" });
    // La trace « manuel » : c'est elle qui protege la saisie des imports.
    await q(`MERGE INTO ENRICHISSEMENT e
             USING (SELECT :k CIBLE, :ch CHAMP, 'manuel' SOURCE FROM DUAL) s
               ON (e.CIBLE = s.CIBLE AND e.CHAMP = s.CHAMP AND e.SOURCE = s.SOURCE)
             WHEN MATCHED THEN UPDATE SET VALEUR = :v, CONFIANCE = 'certain',
                    DETAIL = :qui, VU_LE = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT (CIBLE, TYPE_CIBLE, CHAMP, VALEUR, CONFIANCE, SOURCE, DETAIL)
               VALUES (:k, 'personne', :ch, :v, 'certain', 'manuel', :qui)`,
            { k, ch: champ, v, qui: `uid:${p.uid}` });
    const f = await q(`SELECT * FROM V_PERSONNES WHERE PERSON_KEY = :k`, { k });
    return res.json({ ok: true, fiche: f.rows?.[0] ?? null });
  }

  if (req.method === "DELETE") {
    if (!exigerAdmin(p)) return res.status(403).json({ erreur: "suppression reservee a l'administrateur" });
    const cible = resoudreSource(k);
    if (!cible) return res.status(422).json({ erreur: "fiche non supprimable ici" });
    // L'historique d'envoi est une piece comptable : on ne supprime pas un
    // contact qui a recu du courrier, on l'oppose.
    if (k.startsWith("inv:")) {
      const envois = await q(`SELECT COUNT(*) N FROM INVESTORS.MAILING_SENDS WHERE CONTACT_ID = :id`,
                             { id: cible.valeurCle });
      if ((envois.rows as { N: number }[])[0].N)
        return res.status(409).json({ erreur: "des envois referencent ce contact : utilisez l'opposition" });
      await q(`DELETE FROM INVESTORS.DEMARCHAGE WHERE CONTACT_ID = :id`, { id: cible.valeurCle });
    }
    for (const [table, colonne] of [["CONTACT_STATE", "PERSON_KEY"], ["INTERACTION", "PERSON_KEY"],
                                    ["ENRICHISSEMENT", "CIBLE"], ["CONTACT_LISTE_MEMBRE", "PERSON_KEY"],
                                    ["ATTRIBUT_VALEUR", "PERSON_KEY"]]) {
      await q(`DELETE FROM ${table} WHERE ${colonne} = :k`, { k });
    }
    await q(`DELETE FROM ${cible.table} WHERE ${cible.cle} = :id`, { id: cible.valeurCle });
    return res.json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
  res.status(405).end();
}
