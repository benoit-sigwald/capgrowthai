import type { GetServerSidePropsContext } from "next";

/*
 * Connexion sans dependance a l'hydratation React.
 *
 * Le POST natif vers le callback next-auth exige un jeton CSRF apparie a un
 * cookie. Un script inline vanilla va le chercher au chargement : l'appel pose
 * le cookie (Set-Cookie) et remplit le champ cache. Trois lignes qui marchent
 * meme si React ne s'hydrate pas — c'est exactement la panne qu'on a vue.
 */
export default function Connexion({ erreur }: { erreur: boolean }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-alt)" }}>
      <form method="post" action="/capgrowth/api/auth/callback/credentials" id="fc"
        style={{ background: "var(--card)", borderRadius: "var(--r)",
          boxShadow: "var(--shadow)", padding: 36, width: 340, display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 20 }}>CapGrowthAI</h1>
        <input name="csrfToken" type="hidden" id="csrf" />
        <input name="callbackUrl" type="hidden" defaultValue="/capgrowth/" />
        <input name="email" placeholder="E-mail" autoFocus />
        <input name="motdepasse" placeholder="Mot de passe" type="password" />
        <button className="btn bleu" type="submit" id="btn" disabled>Se connecter</button>
        {erreur && <span style={{ color: "var(--crit)", fontSize: 11 }}>Identifiants refusés.</span>}
      </form>
      <script dangerouslySetInnerHTML={{ __html: `
        fetch('/capgrowth/api/auth/csrf').then(function(r){return r.json()}).then(function(j){
          document.getElementById('csrf').value = j.csrfToken;
          document.getElementById('btn').disabled = false;
        });
      ` }} />
    </main>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  return { props: { erreur: !!ctx.query.error } };
}
