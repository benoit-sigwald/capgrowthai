import type { GetServerSidePropsContext } from "next";
import { getCsrfToken } from "next-auth/react";

/*
 * Connexion sans JavaScript : formulaire HTML natif poste directement au
 * callback next-auth, jeton CSRF rendu cote serveur. Le flux JS (signIn())
 * echouait dans certains navigateurs sans un mot d'erreur — un POST natif n'a
 * rien a hydrater, donc rien qui puisse casser en silence.
 */
export default function Connexion({ csrfToken, erreur }: { csrfToken: string; erreur: boolean }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-alt)" }}>
      <form method="post" action="/capgrowth/api/auth/callback/credentials"
        style={{ background: "var(--card)", borderRadius: "var(--r)",
          boxShadow: "var(--shadow)", padding: 36, width: 340, display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 20 }}>CapGrowthAI</h1>
        <input name="csrfToken" type="hidden" defaultValue={csrfToken} />
        <input name="callbackUrl" type="hidden" defaultValue="/capgrowth/" />
        <input name="email" placeholder="E-mail" autoFocus />
        <input name="motdepasse" placeholder="Mot de passe" type="password" />
        <button className="btn bleu" type="submit">Se connecter</button>
        {erreur && <span style={{ color: "var(--crit)", fontSize: 11 }}>Identifiants refusés.</span>}
      </form>
    </main>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  // getCsrfToken exige explicitement { req } en pages router : lui passer le
  // contexte entier rend une chaine vide, et le POST echoue en silence.
  return { props: { csrfToken: (await getCsrfToken({ req: ctx.req })) ?? "", erreur: !!ctx.query.error } };
}
