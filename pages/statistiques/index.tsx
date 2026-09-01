import { useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

// Un pourcentage sans son effectif ment : on montre toujours les deux.
const taux = (n: number, d: number) => !d ? "—" :
  `${n} (${Math.round(100 * n / d)} %)`;

function Tuile({ n, k }: { n: string | number; k: string }) {
  return (
    <div style={{ background: "var(--bg-alt)", borderRadius: "var(--r)", padding: "18px 20px" }}>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{n}</div>
      <div style={{ fontSize: 10, color: "var(--ink-2)", marginTop: 3 }}>{k}</div>
    </div>);
}

function Stats() {
  const { mandat } = useMandat();
  const [d, setD] = useState<Record<string, never> | null>(null);
  useEffect(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/statistiques?client=${mandat.ID}`).then(r => r.json()).then(setD);
  }, [mandat]);
  if (!d) return <p style={{ color: "var(--ink-3)" }}>Chargement…</p>;
  const g = (d["global"] ?? {}) as Record<string, number>;
  const campagnes = (d["par_campagne"] ?? []) as Record<string, string | number>[];
  const jours = (d["par_jour"] ?? []) as Record<string, string | number>[];
  const domaines = (d["par_domaine"] ?? []) as Record<string, string | number>[];
  const env = g.ENVOYES || 0;

  return (<>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
      gap: 12, marginBottom: 24 }}>
      <Tuile n={env} k="envoyés" />
      <Tuile n={taux(g.OUVERTS || 0, env)} k="ouverts" />
      <Tuile n={taux(g.CLIQUES || 0, env)} k="cliqués" />
      <Tuile n={taux(g.REPONDUS || 0, env)} k="réponses" />
      <Tuile n={taux(g.REBONDS || 0, env)} k="rebonds" />
      <Tuile n={g.PERSONNES || 0} k="personnes touchées" />
    </div>

    <h2 style={{ fontSize: 15, margin: "18px 0 8px" }}>Par campagne</h2>
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
        <thead><tr>{["Campagne", "Lancée", "Ciblées", "Envoyés", "Ouverts", "Cliqués",
          "Réponses", "Rebonds"].map(h =>
          <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10,
            color: "var(--ink-3)", borderBottom: "1px solid var(--hair-soft)" }}>{h}</th>)}
        </tr></thead>
        <tbody>{campagnes.map((c, i) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--hair-soft)" }}>
            <td style={{ padding: "7px 10px", fontWeight: 600 }}>{c.NAME}</td>
            <td style={{ padding: "7px 10px" }}>{c.CREATED_AT ? new Date(String(c.CREATED_AT)).toLocaleDateString("fr-FR") : "—"}</td>
            <td style={{ padding: "7px 10px" }}>{c.TOTAL_TARGETED}</td>
            <td style={{ padding: "7px 10px" }}>{c.ENVOYES}</td>
            <td style={{ padding: "7px 10px" }}>{taux(Number(c.OUVERTS), Number(c.ENVOYES))}</td>
            <td style={{ padding: "7px 10px" }}>{taux(Number(c.CLIQUES), Number(c.ENVOYES))}</td>
            <td style={{ padding: "7px 10px" }}>{taux(Number(c.REPONDUS), Number(c.ENVOYES))}</td>
            <td style={{ padding: "7px 10px" }}>{Number(c.REBONDS) ?
              <span className="pill crit">{taux(Number(c.REBONDS), Number(c.ENVOYES))}</span> : "—"}</td>
          </tr>))}
          {!campagnes.length && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center",
            color: "var(--ink-3)" }}>Aucune campagne.</td></tr>}
        </tbody>
      </table>
    </div>

    <h2 style={{ fontSize: 15, margin: "22px 0 8px" }}>Par domaine expéditeur</h2>
    <p style={{ color: "var(--ink-3)", fontSize: 11, marginBottom: 8 }}>
      C&apos;est la maille du chauffage et de la réputation : un taux de rebond se lit ici,
      pas par campagne.</p>
    {domaines.map((x, i) => (
      <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--hair-soft)" }}>
        <b>{x.DOMAINE}</b> · {x.ENVOYES} envoyés ·{" "}
        {Number(x.REBONDS) ? <span className="pill crit">{taux(Number(x.REBONDS), Number(x.ENVOYES))} de rebond</span>
          : <span className="pill ok">aucun rebond</span>}
      </div>))}
    {!domaines.length && <p style={{ color: "var(--ink-3)" }}>Aucun envoi.</p>}

    <h2 style={{ fontSize: 15, margin: "22px 0 8px" }}>Par jour</h2>
    {jours.map((j, i) => (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0" }}>
        <span className="mono" style={{ width: 90, color: "var(--ink-3)" }}>{j.JOUR}</span>
        <div style={{ height: 8, borderRadius: 4, background: "var(--blue)",
          width: `${Math.min(100, Number(j.ENVOYES) * 4)}%`, minWidth: 4 }} />
        <span>{j.ENVOYES} envoyés · {j.OUVERTS} ouverts · {j.REPONDUS} réponses</span>
      </div>))}
    {!jours.length && <p style={{ color: "var(--ink-3)" }}>Aucun envoi sur la période.</p>}
  </>);
}

export default function PageStatistiques() {
  return (
    <MandatFournisseur>
      <Coquille section="statistiques">
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Statistiques</h1>
        <p style={{ color: "var(--ink-3)", marginBottom: 14 }}>
          Tous les taux se lisent <b>sur les envois</b>, jamais sur les cibles : une cible
          qui n&apos;a rien reçu fausserait le dénominateur.</p>
        <Stats />
      </Coquille>
    </MandatFournisseur>
  );
}
