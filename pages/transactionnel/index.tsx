import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

const ETATS: Record<string, string> = { sent: "", delivered: "ok", opened: "ok",
  clicked: "ok", replied: "ok", bounced: "crit", pending: "warn", complained: "crit" };

const heure = (v: string | null) => v ? new Date(v).toLocaleString("fr-FR",
  { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

function Journal() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Record<string, string | null>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [f, setF] = useState({ q: "", statut: "" });

  const charger = useCallback(() => {
    if (!mandat) return;
    const u = new URLSearchParams({ client: String(mandat.ID), ...f, page: String(page) });
    fetch(`/capgrowth/api/transactionnel?${u}`).then(r => r.json())
      .then(d => { setRows(d.rows || []); setTotal(d.total || 0); });
  }, [mandat, f, page]);
  useEffect(charger, [charger]);

  return (<>
    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
      <input placeholder="Adresse destinataire…" value={f.q} style={{ width: 240 }}
        onChange={e => { setF({ ...f, q: e.target.value }); setPage(0); }} />
      <select value={f.statut} onChange={e => { setF({ ...f, statut: e.target.value }); setPage(0); }}>
        <option value="">Tous les états</option>
        {Object.keys(ETATS).map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <span style={{ alignSelf: "center", color: "var(--ink-3)" }}>
        {total.toLocaleString("fr-FR")} envoi{total > 1 ? "s" : ""}</span>
    </div>
    <div style={{ overflowX: "auto", background: "var(--card)", borderRadius: "var(--r)",
      border: "1px solid var(--hair-soft)", boxShadow: "var(--shadow)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
        <thead><tr>{["Destinataire", "Campagne", "Expéditeur", "État", "Envoyé", "Ouvert",
          "Cliqué", "Répondu", "Rebond"].map(h =>
          <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10,
            color: "var(--ink-3)", borderBottom: "1px solid var(--hair-soft)",
            whiteSpace: "nowrap" }}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(r => (
          <tr key={String(r.SEND_ID)} style={{ borderBottom: "1px solid var(--hair-soft)" }}>
            <td style={{ padding: "6px 10px", fontWeight: 600 }}>{r.EMAIL}</td>
            <td style={{ padding: "6px 10px", color: "var(--ink-2)" }}>{r.CAMPAGNE}</td>
            <td style={{ padding: "6px 10px", color: "var(--ink-2)" }}>{r.EXPEDITEUR_EMAIL || "—"}</td>
            <td style={{ padding: "6px 10px" }}>
              <span className={`pill ${ETATS[String(r.STATUS)] ?? ""}`}>{r.STATUS}</span></td>
            <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{heure(r.SENT_AT)}</td>
            <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{heure(r.OPENED_AT)}</td>
            <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{heure(r.CLICKED_AT)}</td>
            <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{heure(r.REPLIED_AT)}</td>
            <td style={{ padding: "6px 10px", maxWidth: 240 }}>
              {r.BOUNCED_AT ? <span title={String(r.BOUNCE_REASON ?? "")}
                className="pill crit">{String(r.BOUNCE_REASON ?? "rebond").slice(0, 40)}</span> : "—"}</td>
          </tr>))}
          {!rows.length && <tr><td colSpan={9} style={{ padding: 22, textAlign: "center",
            color: "var(--ink-3)" }}>Aucun envoi.</td></tr>}
        </tbody>
      </table>
    </div>
    <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
      <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button>
      <span style={{ color: "var(--ink-3)" }}>{total ? page * 60 + 1 : 0}–{Math.min((page + 1) * 60, total)} sur {total}</span>
      <button className="btn" disabled={(page + 1) * 60 >= total} onClick={() => setPage(page + 1)}>Suivant</button>
    </div>
  </>);
}

export default function PageTransactionnel() {
  return (
    <MandatFournisseur>
      <Coquille section="transactionnel">
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Transactionnel</h1>
        <p style={{ color: "var(--ink-3)", marginBottom: 14 }}>
          Le journal des envois unitaires, en consultation seule — la pièce à ouvrir quand
          on demande « ce message est-il vraiment parti ? ». Le corps du message n&apos;y
          figure pas : il porte des données personnelles et ne sert pas à répondre.</p>
        <Journal />
      </Coquille>
    </MandatFournisseur>
  );
}
