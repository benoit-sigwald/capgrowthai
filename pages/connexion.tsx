import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/router";

export default function Connexion() {
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState("");
  const routeur = useRouter();

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    const r = await signIn("credentials", { redirect: false, email, motdepasse: mdp });
    if (r?.ok) routeur.push("/");
    else setErreur("Identifiants refusés.");
  }
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-alt)" }}>
      <form onSubmit={envoyer} style={{ background: "var(--card)", borderRadius: "var(--r)",
        boxShadow: "var(--shadow)", padding: 36, width: 340, display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 20 }}>CapGrowthAI</h1>
        <input placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        <input placeholder="Mot de passe" type="password" value={mdp} onChange={e => setMdp(e.target.value)} />
        <button className="btn bleu" type="submit">Se connecter</button>
        {erreur && <span style={{ color: "var(--crit)", fontSize: 11 }}>{erreur}</span>}
      </form>
    </main>
  );
}
