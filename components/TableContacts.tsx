import { useEffect, useState, useCallback } from "react";

export type Personne = {
  PERSON_KEY: string; SOURCE: string; FIRST_NAME: string | null; LAST_NAME: string | null;
  EMAIL: string | null; LINKEDIN_URL: string | null; TITLE: string | null;
  COMPANY: string | null; CITY: string | null; COUNTRY: string | null;
  LANGUES: string | null; OPT_OUT: number;
};

// Noms des langues : « fr » ne dit rien a qui parcourt une liste.
const NOM_LANGUE: Record<string, string> = {
  fr: "français", en: "anglais", de: "allemand", nl: "néerlandais", it: "italien",
  es: "espagnol", pt: "portugais", he: "hébreu", ar: "arabe", zh: "chinois",
  ru: "russe", no: "norvégien", sv: "suédois", da: "danois", fi: "finnois",
  pl: "polonais", tr: "turc", ja: "japonais", ko: "coréen",
};
export const nomLangue = (c: string) => NOM_LANGUE[c] || c;

const BASES: Record<string, string> = { investors: "Investisseurs", prospects: "Prospects PACA",
  prospects_dirigeant: "Dirigeants" };
export const nomBase = (s: string) => BASES[s] || (s.startsWith("gate:") ? "Formulaire " + s.slice(5) : s);

export default function TableContacts({ onOuvrir, selection, surSelection, surPage, surFiltre }: {
  onOuvrir: (p: Personne) => void;
  selection?: Set<string>;
  surSelection?: (k: string, coche: boolean) => void;
  // Cocher la case d'en-tete coche les 60 lignes affichees d'un coup.
  surPage?: (cles: string[], coche: boolean) => void;
  // Le filtre et le total remontent : c'est ce qui permet de proposer
  // « selectionner les N du filtre » sans transporter N identifiants.
  surFiltre?: (filtre: Record<string, string>, total: number) => void;
}) {
  const [rows, setRows] = useState<Personne[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  // « joignable » par defaut : les 70 009 fiches de registre sans canal
  // masqueraient tout le reste. Lecon mesuree sur l'outil precedent.
  const [filtre, setFiltre] = useState({ q: "", source: "", canal: "joignable", langues: "" });
  const [languesDispo, setLanguesDispo] = useState<{ LANGUE: string; N: number }[]>([]);
  const [ouvertLangues, setOuvertLangues] = useState(false);

  useEffect(() => {
    fetch("/capgrowth/api/langues").then(r => r.json())
      .then(d => setLanguesDispo(d.rows || [])).catch(() => {});
  }, []);

  const choisies = filtre.langues ? filtre.langues.split(",").filter(Boolean) : [];
  const basculerLangue = (code: string) => {
    const n = choisies.includes(code) ? choisies.filter(c => c !== code) : [...choisies, code];
    setFiltre({ ...filtre, langues: n.join(",") });
    setPage(0);
  };

  const charger = useCallback(() => {
    const u = new URLSearchParams({ ...filtre, page: String(page) });
    fetch(`/capgrowth/api/personnes?${u}`).then(r => r.json())
      .then(d => { setRows(d.rows || []); setTotal(d.total || 0);
                   surFiltre?.(filtre, d.total || 0); });
  }, [filtre, page, surFiltre]);
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
        <div style={{ position: "relative" }}>
          <button className="btn" onClick={() => setOuvertLangues(o => !o)}>
            {choisies.length
              ? `Langues : ${choisies.map(nomLangue).join(", ")}`
              : "Toutes les langues"}
          </button>
          {ouvertLangues && (
            <div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, marginTop: 4,
              background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 12,
              boxShadow: "var(--shadow)", padding: 10, minWidth: 190, maxHeight: 280,
              overflowY: "auto" }}>
              {languesDispo.map(l => (
                <label key={l.LANGUE} style={{ display: "flex", gap: 6, alignItems: "center",
                  padding: "3px 0", fontSize: 11, cursor: "pointer" }}>
                  <input type="checkbox" checked={choisies.includes(l.LANGUE)}
                    onChange={() => basculerLangue(l.LANGUE)} />
                  {nomLangue(l.LANGUE)}
                  <span style={{ color: "var(--ink-3)", marginLeft: "auto" }}>{l.N}</span>
                </label>))}
              {choisies.length > 0 && (
                <button className="btn" style={{ width: "100%", marginTop: 6 }}
                  onClick={() => { setFiltre({ ...filtre, langues: "" }); setPage(0); }}>
                  Tout décocher</button>)}
            </div>)}
        </div>
        <span style={{ alignSelf: "center", color: "var(--ink-3)" }}>
          {total.toLocaleString("fr-FR")} contact{total > 1 ? "s" : ""}</span>
      </div>
      <div style={{ overflowX: "auto", background: "var(--card)", borderRadius: "var(--r)",
        border: "1px solid var(--hair-soft)", boxShadow: "var(--shadow)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead><tr>
            {surSelection && <th style={{ padding: "9px 0 9px 12px",
                borderBottom: "1px solid var(--hair-soft)" }}>
              <input type="checkbox" title="Sélectionner les lignes affichées"
                checked={rows.length > 0 && rows.every(r => selection?.has(r.PERSON_KEY))}
                onChange={e => surPage?.(rows.map(r => r.PERSON_KEY), e.target.checked)} />
            </th>}
            {["Nom", "Société / titre", "Base", "E-mail", "Langues"].map(h =>
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
                <td style={{ padding: "7px 12px" }} title={[r.CITY, r.COUNTRY].filter(Boolean).join(", ")}>
                  {r.LANGUES
                    ? r.LANGUES.split(",").map(l => (
                        <span key={l} className="pill" style={{ marginRight: 3 }}>{nomLangue(l)}</span>))
                    : <span className="pill warn">inconnue</span>}</td>
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
