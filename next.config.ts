import type { NextConfig } from "next";

// basePath obligatoire : l'app est servie sous arx-consulting.com/capgrowth et
// Traefik ne retire PAS le prefixe (un strip casserait les assets /_next).
const config: NextConfig = {
  basePath: "/capgrowth",
  output: "standalone",
  // oracledb est un module natif CJS : il ne doit pas etre empaquete par le
  // bundler, sinon le build echoue sur les binaires.
  serverExternalPackages: ["oracledb", "adm-zip"],
  /*
   * Le HTML ne se met jamais en cache.
   *
   * Sans cet en-tete, un navigateur garde la page et continue de demander les
   * chunks du build precedent — supprimes au deploiement suivant. Resultat :
   * la page s'affiche mais rien ne s'hydrate, et l'ecran parait vide sans
   * qu'aucune erreur ne soit visible. C'est exactement ce qui est arrive.
   *
   * Les fichiers sous /_next/static portent un hachage dans leur nom : eux
   * peuvent etre gardes indefiniment, c'est meme tout l'interet.
   */
  async headers() {
    return [
      { source: "/_next/static/:chemin*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/:chemin*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] },
    ];
  },
};
export default config;
