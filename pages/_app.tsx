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

/*
 * Le beacon du tracker.
 *
 * Les autres sites du parc chargent /gate/t.js, qui emet une visite au
 * chargement de la page. Ici ce script ne verrait que la premiere : capgrowth
 * navigue cote client, et le tracker n'afficherait qu'une visite par session,
 * quel que soit le nombre d'ecrans parcourus. On emet donc a chaque route.
 *
 * arx-consulting.com sert /gate ET /capgrowth : meme origine, pas de CORS.
 *
 * L'echec est silencieux, et c'est voulu : un compteur de visites n'a aucune
 * raison d'empecher l'outil de fonctionner.
 */
function Beacon() {
  const routeur = useRouter();
  useEffect(() => {
    const emettre = () => {
      // On lit l'URL du navigateur plutot que celle du routeur : elle porte le
      // prefixe /capgrowth, ce qui rend les pages lisibles dans le tracker a
      // cote de celles des autres sites.
      const corps = JSON.stringify({
        site: "capgrowth",
        page: location.pathname + location.search,
        ref: document.referrer || "",
        lang: navigator.language || "",
        screen: `${screen.width}x${screen.height}`,
      });
      try {
        if (navigator.sendBeacon) navigator.sendBeacon("/gate/t", corps);
        else fetch("/gate/t", { method: "POST", body: corps, keepalive: true });
      } catch { /* le suivi ne doit jamais casser la navigation */ }
    };
    emettre();
    routeur.events.on("routeChangeComplete", emettre);
    return () => routeur.events.off("routeChangeComplete", emettre);
  }, [routeur]);
  return null;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SessionProvider session={pageProps.session} basePath="/capgrowth/api/auth">
      <Beacon />
      <Garde><Component {...pageProps} /></Garde>
    </SessionProvider>
  );
}
