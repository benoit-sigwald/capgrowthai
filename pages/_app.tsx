import type { AppProps } from "next/app";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { SessionProvider, useSession } from "next-auth/react";
import "@/styles/global.css";

/** Pages accessibles sans session. */
const PUBLIQUES = ["/connexion", "/signin"];

/*
 * Sans cette garde, un visiteur sans session voyait l'application COMPLETE et
 * vide : le menu, les titres, un selecteur de mandat sans options, un tableau
 * de bord bloque sur « Chargement… », et « reserve a l'administrateur » sur les
 * Parametres — parce que la portee etait absente, pas parce que le compte
 * manquait de droits. Toutes les API repondaient 401, mais l'ecran n'en disait
 * rien : cela se lisait comme un outil casse, alors que c'etait une session
 * expiree.
 *
 * Constate le 2026-09-01.
 */
function Garde({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const routeur = useRouter();
  const publique = PUBLIQUES.includes(routeur.pathname);

  useEffect(() => {
    if (status === "unauthenticated" && !publique) routeur.replace("/connexion");
  }, [status, publique, routeur]);

  if (publique) return <>{children}</>;
  if (status === "loading") return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center",
      color: "var(--ink-3)", fontSize: 12 }}>Chargement…</main>);
  // Rien pendant la redirection : une coquille vide se lit comme une panne.
  if (status === "unauthenticated") return null;
  return <>{children}</>;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SessionProvider session={pageProps.session} basePath="/capgrowth/api/auth">
      <Garde><Component {...pageProps} /></Garde>
    </SessionProvider>
  );
}
