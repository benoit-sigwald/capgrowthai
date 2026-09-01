import type { NextConfig } from "next";

// basePath obligatoire : l'app est servie sous arx-consulting.com/capgrowth et
// Traefik ne retire PAS le prefixe (un strip casserait les assets /_next).
const config: NextConfig = {
  basePath: "/capgrowth",
  output: "standalone",
  // oracledb est un module natif CJS : il ne doit pas etre empaquete par le
  // bundler, sinon le build echoue sur les binaires.
  serverExternalPackages: ["oracledb", "adm-zip"],
};
export default config;
