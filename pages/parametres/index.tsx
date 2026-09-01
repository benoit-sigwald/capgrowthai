import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Coquille from "@/components/Coquille";
import { MandatFournisseur } from "@/lib/mandat";

function Mandats() {
  const [rows, setRows] = useState<Record<string, never>[]>([]);
  const [nom, setNom] = useState("");
  const [mode, setMode] = useState("mandat");
  const charger = useCallback(() => {
    fetch("/capgrowth/api/clients").then(r => r.json()).then(d => setRows(d.rows || []));
  }, []);
  useEffect(charger, [charger]);
  async function creer() {
    if (!nom) return;
    await fetch("/capgrowth/api/clients", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nom, mode }) });
    setNom(""); charger();
  }
  return (<>
    <h2 style={{ fontSize: 15, margin: "8px 0" }}>Mandats</h2>
    <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
      <input placeholder="Nom du mandat" value={nom} onChange={e => setNom(e.target.value)} />
      <select value={mode} onChange={e => setMode(e.target.value)}
        title="Qui envoie : le mandat (adresses communes) ou chaque utilisateur sous la sienne">
        <option value="mandat">Expéditeur de mandat</option>
        <option value="utilisateur">Expéditeur par utilisateur</option>
      </select>
      <button className="btn bleu" onClick={creer}>Créer</button>
    </div>
    {rows.map(c => <div key={c["ID"]} style={{ padding: "6px 0",
      borderBottom: "1px solid var(--hair-soft)", fontSize: 12 }}>
      <b>{c["NOM"]}</b> <span className="pill">{c["MODE_EXPEDITEUR"]}</span>
      <span style={{ color: "var(--ink-3)" }}> · {c["UTILISATEURS"]} utilisateur(s), {c["EXPEDITEURS"]} expéditeur(s)</span>
    </div>)}
  </>);
}

function Utilisateurs() {
  const [rows, setRows] = useState<Record<string, never>[]>([]);
  const [mandats, setMandats] = useState<{ ID: number; NOM: string }[]>([]);
  const [f, setF] = useState({ email: "", nom: "", role: "membre", client_ids: [] as number[] });
  const [initial, setInitial] = useState("");
  const charger = useCallback(() => {
    fetch("/capgrowth/api/utilisateurs").then(r => r.json()).then(d => setRows(d.rows || []));
    fetch("/capgrowth/api/clients").then(r => r.json()).then(d => setMandats(d.rows || []));
  }, []);
  useEffect(charger, [charger]);
  async function creer() {
    const r = await fetch("/capgrowth/api/utilisateurs", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json();
    if (r.ok) {
      setInitial(`Mot de passe initial de ${f.email} : ${j.motdepasse_initial} — transmettez-le par un canal sûr, il ne sera plus jamais affiché.`);
      setF({ email: "", nom: "", role: "membre", client_ids: [] }); charger();
    } else setInitial(j.erreur);
  }
  return (<>
    <h2 style={{ fontSize: 15, margin: "22px 0 8px" }}>Utilisateurs</h2>
    <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
      <input placeholder="E-mail" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
      <input placeholder="Nom" value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} style={{ width: 120 }} />
      <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
        <option value="membre">membre</option><option value="client">client</option>
        <option value="admin">admin</option>
      </select>
      <select multiple value={f.client_ids.map(String)} style={{ minWidth: 150 }}
        onChange={e => setF({ ...f, client_ids: [...e.target.selectedOptions].map(o => Number(o.value)) })}>
        {mandats.map(m => <option key={m.ID} value={m.ID}>{m.NOM}</option>)}
      </select>
      <button className="btn bleu" onClick={creer}>Créer</button>
    </div>
    {initial && <p className="pill warn" style={{ fontSize: 11 }}>{initial}</p>}
    {rows.map(u => <div key={u["ID"]} style={{ padding: "6px 0",
      borderBottom: "1px solid var(--hair-soft)", fontSize: 12 }}>
      <b>{u["EMAIL"]}</b> <span className="pill">{u["ROLE"]}</span>
      <span style={{ color: "var(--ink-3)" }}> · {u["MANDATS"] || "aucun mandat"}</span>
    </div>)}
  </>);
}

export default function PageParametres() {
  const { data: session } = useSession();
  const admin = (session as never as { portee?: { role: string } })?.portee?.role === "admin";
  return (
    <MandatFournisseur>
      <Coquille section="parametres">
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Paramètres</h1>
        <p style={{ marginBottom: 14 }}>
          <Link href="/parametres/expediteurs">Expéditeurs et authentification de domaine →</Link>
        </p>
        {admin ? (<><Mandats /><Utilisateurs /></>)
          : <p className="pill warn">Mandats et utilisateurs : réservé à l&apos;administrateur.</p>}
      </Coquille>
    </MandatFournisseur>
  );
}
