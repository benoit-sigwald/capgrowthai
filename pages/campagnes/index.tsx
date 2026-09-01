import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

const taux = (n: number, d: number) => d ? `${n} (${Math.round(100 * n / d)} %)` : "—";

function Campagnes() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Record<string, never>[]>([]);
  const [msg, setMsg] = useState("");

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/campagnes?client=${mandat.ID}`).then(r => r.json())
      .then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);

  async function envoyer(id: string) {
    setMsg("Envoi du lot…");
    const r = await fetch(`/capgrowth/api/campagnes/${encodeURIComponent(id)}/envoyer?client=${mandat?.ID}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lot: 20 }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    // La reponse du mailer fait foi : plafond et journees viennent de lui.
    setMsg(`${j.envoyes} envoyé(s) — plafond du jour ${j.plafond} (jour d'envoi n°${(j.journees_d_envoi ?? 0) + 1}), reste ${j.restant_aujourdhui}.`);
    charger();
  }

  return (<>
    <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
      <Link href="/campagnes/nouvelle" className="btn bleu"
        style={{ display: "inline-block" }}>Nouvelle campagne</Link>
      {msg && <span style={{ color: "var(--ink-2)", fontSize: 11 }}>{msg}</span>}
    </div>
    <div style={{ overflowX: "auto", background: "var(--card)", borderRadius: "var(--r)",
      border: "1px solid var(--hair-soft)", boxShadow: "var(--shadow)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
        <thead><tr>{["Campagne", "Expéditeur", "Ciblées", "Envoyés", "En attente",
          "Ouverts", "Cliqués", "Réponses", "Rebonds", ""].map(h =>
          <th key={h} style={{ textAlign: "left", padding: "9px 12px", fontSize: 10,
            color: "var(--ink-3)", borderBottom: "1px solid var(--hair-soft)" }}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(c => (
          <tr key={c["CAMPAIGN_ID"]} style={{ borderBottom: "1px solid var(--hair-soft)" }}>
            <td style={{ padding: "8px 12px", fontWeight: 600 }}>{c["NAME"]}</td>
            <td style={{ padding: "8px 12px", color: "var(--ink-2)" }}>{c["EXPEDITEUR_EMAIL"] || "—"}</td>
            <td style={{ padding: "8px 12px" }}>{c["TOTAL_TARGETED"]}</td>
            <td style={{ padding: "8px 12px" }}>{c["ENVOYES"]}</td>
            <td style={{ padding: "8px 12px" }}>{c["EN_ATTENTE"]}</td>
            <td style={{ padding: "8px 12px" }}>{taux(c["OUVERTS"], c["ENVOYES"])}</td>
            <td style={{ padding: "8px 12px" }}>{taux(c["CLIQUES"], c["ENVOYES"])}</td>
            <td style={{ padding: "8px 12px" }}>{taux(c["REPONDUS"], c["ENVOYES"])}</td>
            <td style={{ padding: "8px 12px" }}>{c["REBONDS"] ? <span className="pill crit">{c["REBONDS"]}</span> : "—"}</td>
            <td style={{ padding: "8px 12px" }}>
              {Number(c["EN_ATTENTE"]) > 0 &&
                <button className="btn" onClick={() => envoyer(String(c["CAMPAIGN_ID"]))}>Envoyer un lot</button>}
            </td>
          </tr>))}
          {!rows.length && <tr><td colSpan={10} style={{ padding: 24, textAlign: "center",
            color: "var(--ink-3)" }}>Aucune campagne sur ce mandat.</td></tr>}
        </tbody>
      </table>
    </div>
  </>);
}

export default function PageCampagnes() {
  return (
    <MandatFournisseur>
      <Coquille section="campagnes">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Campagnes</h1>
        <p style={{ color: "var(--ink-3)" }}>Les taux se lisent sur les envois, jamais sur les cibles.
          Le plafond du jour vient du chauffage du domaine expéditeur.</p>
        <Campagnes />
      </Coquille>
    </MandatFournisseur>
  );
}
