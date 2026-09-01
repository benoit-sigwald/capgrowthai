import { useState } from "react";
import { useRouter } from "next/router";
import { signIn } from "next-auth/react";

/*
 * Connexion.
 *
 * Le premier jet postait un formulaire HTML natif et allait chercher le jeton
 * CSRF avec un script inline. Panne mesuree le 2026-09-01 : ce script et le
 * SessionProvider de next-auth demandaient le jeton EN MEME TEMPS. Les deux
 * requetes arrivaient sans cookie, chacune creait un jeton et posait le sien ;
 * le dernier Set-Cookie gagnait, et le formulaire gardait l'autre. A l'envoi,
 * next-auth constatait le desaccord et redirigeait vers /signin?csrf=true —
 * une page qui n'existe pas ici, d'ou le 404, alors que les identifiants
 * eux-memes etaient bons.
 *
 * signIn() demande le jeton au moment de l'envoi, par le meme client que celui
 * qui gere le cookie : plus de course, et plus de jeton perime dans un onglet
 * laisse ouvert.
 */
export default function Connexion() {
  const routeur = useRouter();
  const [email, setEmail] = useState("");
  const [motdepasse, setMotdepasse] = useState("");
  const [msg, setMsg] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function entrer(e: React.FormEvent) {
    e.preventDefault();
    setEnvoi(true); setMsg("");
    const r = await signIn("credentials", { email, motdepasse, redirect: false });
    setEnvoi(false);
    if (r?.ok) { routeur.push("/"); return; }
    // « CredentialsSignin » est le seul refus attendu ; le reste est une panne,
    // et une panne ne doit pas se deguiser en mot de passe faux.
    setMsg(r?.error === "CredentialsSignin"
      ? "Identifiants refusés."
      : `Connexion indisponible (${r?.error || "erreur inconnue"}).`);
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center",
      background: "var(--bg-alt)" }}>
      <form onSubmit={entrer} style={{ background: "var(--card)", borderRadius: "var(--r)",
        boxShadow: "var(--shadow)", padding: 36, width: 340, display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 20 }}>CapGrowthAI</h1>
        <input name="email" placeholder="E-mail" autoFocus autoComplete="username"
          value={email} onChange={e => setEmail(e.target.value)} />
        <input name="motdepasse" placeholder="Mot de passe" type="password"
          autoComplete="current-password"
          value={motdepasse} onChange={e => setMotdepasse(e.target.value)} />
        <button className="btn bleu" type="submit" disabled={envoi || !email || !motdepasse}>
          {envoi ? "…" : "Se connecter"}</button>
        {msg && <span style={{ color: "var(--crit)", fontSize: 11 }}>{msg}</span>}
      </form>
    </main>
  );
}
