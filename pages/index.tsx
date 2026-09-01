import { useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

function Tuile({ n, k }: { n: string | number; k: string }) {
  return (
    <div style={{ background: "var(--bg-alt)", borderRadius: "var(--r)", padding: "20px 22px" }}>
      <div style={{ fontSize: 23, fontWeight: 600 }}>{n}</div>
      <div style={{ fontSize: 10, color: "var(--ink-2)", marginTop: 3 }}>{k}</div>
    </div>
  );
}

function Tableau() {
  const { mandat } = useMandat();
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/tableau-de-bord?client=${mandat.ID}`).then(r => r.json()).then(setD);
  }, [mandat]);
  if (!d) return <p style={{ color: "var(--ink-3)" }}>Chargement…</p>;
  const envois = (d["envois"] ?? {}) as { AUJOURDHUI?: number; EN_ATTENTE?: number };
  const campagnes = (d["dernieres_campagnes"] ?? []) as Record<string, string | number>[];
  const reponses = d["reponses_a_traiter"] as number | null;
  return (<>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
      gap: 12, marginBottom: 24 }}>
      <Tuile n={envois.AUJOURDHUI ?? 0} k="envois aujourd'hui" />
      <Tuile n={envois.EN_ATTENTE ?? 0} k="en attente d'envoi" />
      <Tuile n={reponses ?? "—"} k="réponses à traiter (Arx, tous mandats — par mandat en tranche 3)" />
    </div>
    <h2 style={{ fontSize: 15, marginBottom: 8 }}>Dernières campagnes</h2>
    {campagnes.length ? (
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
        <tbody>{campagnes.map(c => (
          <tr key={String(c.CAMPAIGN_ID)} style={{ borderBottom: "1px solid var(--hair-soft)" }}>
            <td style={{ padding: "8px 12px", fontWeight: 600 }}>{c.NAME}</td>
            <td style={{ padding: "8px 12px" }}>{c.ENVOYES}/{c.TOTAL_TARGETED} envoyés</td>
            <td style={{ padding: "8px 12px" }}>{c.REPONDUS} réponse(s)</td>
          </tr>))}
        </tbody>
      </table>
    ) : <p style={{ color: "var(--ink-3)" }}>Aucune campagne sur ce mandat.</p>}
  </>);
}

export default function Accueil() {
  return (
    <MandatFournisseur>
      <Coquille section="">
        <h1 style={{ fontSize: 22, marginBottom: 16 }}>Tableau de bord</h1>
        <Tableau />
      </Coquille>
    </MandatFournisseur>
  );
}
