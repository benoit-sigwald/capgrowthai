import { useEffect, useState, useCallback } from "react";

export type Personne = {
  PERSON_KEY: string; SOURCE: string; FIRST_NAME: string | null; LAST_NAME: string | null;
  EMAIL: string | null; LINKEDIN_URL: string | null; TITLE: string | null;
  COMPANY: string | null; CITY: string | null; COUNTRY: string | null; OPT_OUT: number;
};

const BASES: Record<string, string> = { investors: "Investisseurs", prospects: "Prospects PACA",
  prospects_dirigeant: "Dirigeants" };
export const nomBase = (s: string) => BASES[s] || (s.startsWith("gate:") ? "Formulaire " + s.slice(5) : s);

export default function TableContacts({ onOuvrir, selection, surSelection }: {
  onOuvrir: (p: Personne) => void;
  selection?: Set<string>;
  surSelection?: (k: string, coche: boolean) => void;
}) {
  const [rows, setRows] = useState<Personne[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  // « joignable » par defaut : les 70 009 fiches de registre sans canal
  // masqueraient tout le reste. Lecon mesuree sur l'outil precedent.
  const [filtre, setFiltre] = useState({ q: "", source: "", canal: "joignable" });

  const charger = useCallback(() => {
    const u = new URLSearchParams({ ...filtre, page: String(page) });
    fetch(`/capgrowth/api/personnes?${u}`).then(r => r.json())
      .then(d => { setRows(d.rows || []); setTotal(d.total || 0); });
  }, [filtre, page]);
  useEffect(charger, [charger]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <input placeholder="Nom, société, e-mail…" value={filtre.q}
          onChange={e => { setFiltre({ ...filtre, q: e.target.value }); setPage(0); }} style={{ width: 260 }} />
        <select value={filtre.source} onChange={e => { setFiltre({ ...filtre, source: e.target.value }); setPage(0); }}>
          <option value="">Toutes les bases</option>
          <option value="investors">Investisseurs</option>
          <option value="prospects">Prospects PACA</option>
          <option value="prospects_dirigeant">Dirigeants</option>
          <option value="gate">Formulaires</option>
        </select>
        <select value={filtre.canal} onChange={e => { setFiltre({ ...filtre, canal: e.target.value }); setPage(0); }}>
          <option value="joignable">Joignables</option>
          <option value="email">Avec e-mail</option>
          <option value="linkedin">Avec LinkedIn</option>
          <option value="">Tout le référentiel</option>
        </select>
        <span style={{ alignSelf: "center", color: "var(--ink-3)" }}>
          {total.toLocaleString("fr-FR")} contact{total > 1 ? "s" : ""}</span>
      </div>
      <div style={{ overflowX: "auto", background: "var(--card)", borderRadius: "var(--r)",
        border: "1px solid var(--hair-soft)", boxShadow: "var(--shadow)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead><tr>
            {surSelection && <th />}
            {["Nom", "Société / titre", "Base", "E-mail", "Lieu"].map(h =>
              <th key={h} style={{ textAlign: "left", padding: "9px 12px", fontSize: 10,
                color: "var(--ink-3)", borderBottom: "1px solid var(--hair-soft)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.PERSON_KEY} onClick={() => onOuvrir(r)}
                style={{ cursor: "pointer", borderBottom: "1px solid var(--hair-soft)" }}>
                {surSelection && <td style={{ padding: "7px 0 7px 12px" }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selection?.has(r.PERSON_KEY) ?? false}
                    onChange={e => surSelection(r.PERSON_KEY, e.target.checked)} /></td>}
                <td style={{ padding: "7px 12px", fontWeight: 600 }}>
                  {[r.FIRST_NAME, r.LAST_NAME].filter(Boolean).join(" ") || "—"}
                  {r.OPT_OUT === 1 && <span className="pill crit" style={{ marginLeft: 6 }}>opt-out</span>}</td>
                <td style={{ padding: "7px 12px", color: "var(--ink-2)" }}>
                  {r.COMPANY || "—"}{r.TITLE ? ` · ${r.TITLE}` : ""}</td>
                <td style={{ padding: "7px 12px" }}><span className="pill">{nomBase(r.SOURCE)}</span></td>
                <td style={{ padding: "7px 12px" }}>{r.EMAIL || "—"}</td>
                <td style={{ padding: "7px 12px" }}>{[r.CITY, r.COUNTRY].filter(Boolean).join(", ") || "—"}</td>
              </tr>))}
            {!rows.length && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center",
              color: "var(--ink-3)" }}>Aucun résultat.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
        <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button>
        <span style={{ color: "var(--ink-3)" }}>{total ? page * 60 + 1 : 0}–{Math.min((page + 1) * 60, total)} sur {total.toLocaleString("fr-FR")}</span>
        <button className="btn" disabled={(page + 1) * 60 >= total} onClick={() => setPage(page + 1)}>Suivant</button>
      </div>
    </div>
  );
}
