import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Coquille from "@/components/Coquille";
import FicheCrm from "@/components/FicheCrm";
import { MandatFournisseur, useMandat } from "@/lib/mandat";
import { LIBELLES, type Statut } from "@/lib/crm";

type Fiche = Record<string, string | number | null>;

const SECTIONS: [string, string, string][] = [
  ["reponses", "Réponses à traiter", "Quelqu’un a répondu et personne n’a repris la main."],
  ["retard", "En retard", "L’échéance est passée."],
  ["dues", "Pour aujourd’hui", "Ce qui tombe à date."],
  ["semaine", "Cette semaine", "Ce qui vient."],
];

function Carte({ f, surOuvrir }: { f: Fiche; surOuvrir: (k: string) => void }) {
  const j = f.JOURS as number | null;
  const st = String(f.STATUT ?? "a_contacter") as Statut;
  const [lib, cl] = LIBELLES[st] ?? [st, ""];
  return (
    <div onClick={() => surOuvrir(String(f.PERSON_KEY))}
      style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--card)",
        border: "1px solid var(--hair-soft)", borderRadius: "var(--r)", padding: "14px 18px",
        cursor: "pointer", marginBottom: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 13 }}>{[f.FIRST_NAME, f.LAST_NAME].filter(Boolean).join(" ") || "—"}</b>
        <div style={{ color: "var(--ink-2)" }}>{f.COMPANY || "—"}{f.TITLE ? ` · ${f.TITLE}` : ""}</div>
      </div>
      <div style={{ textAlign: "right", color: "var(--ink-3)" }}>
        <span className={`pill ${cl}`}>{lib}</span>
        {j !== null && j !== undefined && (
          <span className={`pill ${j < 0 ? "crit" : j === 0 ? "warn" : ""}`} style={{ marginLeft: 4 }}>
            {j < 0 ? `retard ${-j} j` : j === 0 ? "aujourd'hui" : `dans ${j} j`}</span>)}
        <div style={{ marginTop: 4 }}>{f.ACTION_TYPE || ""}{f.PROPRIETAIRE ? ` · ${f.PROPRIETAIRE}` : ""}</div>
      </div>
    </div>);
}

function Taches({ surOuvrir }: { surOuvrir: (k: string) => void }) {
  const { mandat } = useMandat();
  const { data: session } = useSession();
  const admin = (session as never as { portee?: { role: string } })?.portee?.role === "admin";
  const [d, setD] = useState<Record<string, Fiche[]> | null>(null);
  const [equipe, setEquipe] = useState(false);

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/taches?client=${mandat.ID}${equipe ? "&equipe=1" : ""}`)
      .then(r => r.json()).then(setD);
  }, [mandat, equipe]);
  useEffect(charger, [charger]);

  if (!d) return <p style={{ color: "var(--ink-3)" }}>Chargement…</p>;
  const total = SECTIONS.reduce((n, [k]) => n + (d[k]?.length ?? 0), 0);
  return (<>
    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
      <b>{total} à traiter</b>
      {admin && <label style={{ fontSize: 11 }}>
        <input type="checkbox" checked={equipe} onChange={e => setEquipe(e.target.checked)} /> vue équipe
      </label>}
      <Link href="/crm">← Pipeline</Link>
    </div>
    <div style={{ maxWidth: 900, display: "grid", gap: 30 }}>
      {SECTIONS.map(([k, titre, sous]) => (
        <section key={k}>
          <h2 style={{ fontSize: 20 }}>{titre}
            {d[k]?.length ? <span style={{ color: "var(--ink-3)" }}> {d[k].length}</span> : null}</h2>
          <div style={{ color: "var(--ink-3)", fontSize: 11, marginBottom: 12 }}>{sous}</div>
          {d[k]?.length
            ? d[k].map(f => <Carte key={String(f.PERSON_KEY)} f={f} surOuvrir={surOuvrir} />)
            : <div style={{ background: "var(--bg-alt)", borderRadius: "var(--r)", padding: 22,
                textAlign: "center", color: "var(--ink-3)" }}>Rien ici.</div>}
        </section>))}
    </div>
  </>);
}

export default function PageTaches() {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [v, setV] = useState(0);
  return (
    <MandatFournisseur>
      <Coquille section="crm">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Mes tâches</h1>
        <Taches key={v} surOuvrir={setOuvert} />
        {ouvert && <FicheCrm personKey={ouvert} onFermer={() => setOuvert(null)}
          onChange={() => setV(x => x + 1)} />}
      </Coquille>
    </MandatFournisseur>
  );
}
