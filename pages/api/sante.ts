import type { NextApiRequest, NextApiResponse } from "next";
// Route publique (exclue du middleware) : elle sert au conteneur et a Traefik
// pour savoir si l'app repond, pas a exposer quoi que ce soit.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.json({ ok: true, app: "capgrowthai" });
}
