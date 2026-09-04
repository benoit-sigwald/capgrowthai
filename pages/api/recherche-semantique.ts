import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";

/*
 * recherche-semantique.ts — Endpoint de Recherche Vectorielle Sémantique
 * Connecté au moteur Oracle Database 23ai AI Vector Search et à l'API Mistral Embeddings.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "Non authentifié" });

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ erreur: "Méthode non autorisée" });
  }

  const query = (req.method === "POST" ? req.body?.query : req.query.q) as string;
  const limit = Math.min(Number(req.query.limit || req.body?.limit || 15), 50);
  const territoire = (req.method === "POST" ? req.body?.territoire : req.query.territoire) as string | undefined;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({ erreur: "Le paramètre 'query' est requis (min 2 caractères)." });
  }

  const mistralKey = process.env.MISTRAL_API_KEY || "";
  if (!mistralKey) {
    return res.status(500).json({ erreur: "MISTRAL_API_KEY non configurée sur le serveur." });
  }

  try {
    // 1. Génération de l'embedding via Mistral (Free Tier)
    const resp = await fetch("https://api.mistral.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${mistralKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-embed",
        input: [query.trim()]
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(502).json({ erreur: `Erreur Mistral API: ${errText.slice(0, 200)}` });
    }

    const data = await resp.json();
    const queryVector = data.data[0].embedding;

    // 2. Requête Oracle Database 23ai avec distance cosinus
    let sql = `
      SELECT e.ID, e.RAISON_SOCIALE, e.DIRIGEANT, e.TERRITOIRE, e.SITE_WEB, e.TELEPHONE, e.SOURCE,
             VECTOR_DISTANCE(e.VECTEUR_THESE, VECTOR(:qvec, 1024, FLOAT32), COSINE) AS DISTANCE,
             (SELECT COUNT(*) FROM CONTACTS c WHERE c.ENTREPRISE_ID = e.ID) AS NB_CONTACTS
      FROM ENTREPRISES e
      WHERE e.VECTEUR_THESE IS NOT NULL
    `;

    const binds: Record<string, any> = {
      qvec: JSON.stringify(queryVector),
      lim: limit
    };

    if (territoire && territoire !== "TOUS") {
      sql += ` AND e.TERRITOIRE = :terr`;
      binds.terr = territoire;
    }

    sql += ` ORDER BY DISTANCE ASC FETCH FIRST :lim ROWS ONLY`;

    const result = await q(sql, binds);

    const matches = (result.rows || []).map((row: any) => {
      const dist = typeof row.DISTANCE === "number" ? row.DISTANCE : parseFloat(row.DISTANCE);
      const similarity = Math.max(0, Math.min(100, (1.0 - dist) * 100));
      return {
        id: row.ID,
        raison_sociale: row.RAISON_SOCIALE,
        dirigeant: row.DIRIGEANT,
        territoire: row.TERRITOIRE,
        site_web: row.SITE_WEB,
        telephone: row.TELEPHONE,
        source: row.SOURCE,
        nb_contacts: row.NB_CONTACTS,
        similarity_score: parseFloat(similarity.toFixed(1)),
        cosine_distance: parseFloat(dist.toFixed(4))
      };
    });

    return res.json({
      success: true,
      query: query,
      total_matches: matches.length,
      results: matches
    });

  } catch (error: any) {
    console.error("[RECHERCHE SEMANTIQUE ERROR]", error);
    return res.status(500).json({ erreur: error.message || "Erreur interne de recherche vectorielle." });
  }
}
