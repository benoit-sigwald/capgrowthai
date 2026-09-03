import { useEffect, useState, useCallback } from "react";
import MenuCases from "./MenuCases";
import { useMandat } from "@/lib/mandat";

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

/*
 * Les bases du referentiel, telles qu'elles se nomment dans V_PERSONNES.
 *
 * Une seule liste sert au filtre ET au libelle d'une ligne : deux listes de
 * noms pour la meme chose finissent par se contredire.
 */
const BASES = [
  { id: "investors", libelle: "Investisseurs" },
  { id: "prospects", libelle: "Prospects PACA" },
  { id: "prospects_dirigeant", libelle: "Dirigeants" },
  { id: "gate", libelle: "Formulaires" },
] as const;

export const nomBase = (s: string) => BASES.find(b => b.id === s)?.libelle
  || (s.startsWith("gate:") ? "Formulaire " + s.slice(5) : s);

/* Les canaux par lesquels on peut atteindre quelqu'un. */
const CANAUX = [
  { id: "email", libelle: "E-mail" },
  { id: "linkedin", libelle: "LinkedIn" },
  { id: "telephone", libelle: "Téléphone" },
] as const;

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
  const { mandat } = useMandat();
  const [segments, setSegments] = useState<{ ID: number; NOM: string;
    FILTRE: Record<string, string> }[]>([]);
  const [rows, setRows] = useState<Personne[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  // « joignable » par defaut : les 70 009 fiches de registre sans canal
  // masqueraient tout le reste. Lecon mesuree sur l'outil precedent.
  const [filtre, setFiltre] = useState({ q: "", source: "", canal: "joignable",
    langues: "", pays: "", secteur: "" });
  const [paysDispo, setPaysDispo] = useState<{ VALEUR: string; N: number }[]>([]);
  const [secteurs, setSecteurs] = useState<{ id: string; libelle: string; n: number }[]>([]);

  const basesChoisies = filtre.source.split(",").map(x => x.trim()).filter(Boolean);

  /*
   * « joignable » reste la valeur ecrite dans les segments enregistres : on la
   * developpe a l'affichage plutot que de la reecrire, sinon un segment cree
   * hier changerait de sens aujourd'hui.
   */
  const canauxChoisis = filtre.canal.split(",").map(c => c.trim()).filter(Boolean)
    .flatMap(c => (c === "joignable" ? CANAUX.map(x => x.id) : [c]))
    .filter(c => CANAUX.some(x => x.id === c));
  const [languesDispo, setLanguesDispo] = useState<{ LANGUE: string; N: number }[]>([]);

  useEffect(() => {
    fetch("/capgrowth/api/langues").then(r => r.json())
      .then(d => setLanguesDispo(d.rows || [])).catch(() => {});
    fetch("/capgrowth/api/valeurs?champ=pays").then(r => r.json())
      .then(d => setPaysDispo(d.rows || [])).catch(() => {});
    // Familles d'abord, longue traine ensuite : le menu se cherche.
    fetch("/capgrowth/api/valeurs?champ=secteur").then(r => r.json())
      .then(d => setSecteurs([...(d.familles || []), ...(d.autres || [])])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/segments?client=${mandat.ID}`).then(r => r.json())
      .then(d => setSegments(d.rows || [])).catch(() => {});
  }, [mandat]);

  const listeDe = (champ: "pays" | "secteur") =>
    filtre[champ].split(",").map(x => x.trim()).filter(Boolean);

  const choisies = filtre.langues ? filtre.langues.split(",").filter(Boolean) : [];

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
        {/* Partir d'un segment.
            Il CHARGE ses criteres dans les filtres, il ne s'y substitue pas :
            on voit ce que le segment contient, et on peut l'ajuster sans le
            modifier. Le segment lui-meme ne bouge que dans son propre ecran. */}
        {segments.length > 0 && (
          <select value="" style={{ maxWidth: 200 }}
            onChange={e => {
              const s = segments.find(x => String(x.ID) === e.target.value);
              e.target.value = "";
              if (!s) return;
              setFiltre({ q: "", source: "", canal: "", langues: "", pays: "", secteur: "",
                          ...(s.FILTRE || {}) });
              setPage(0);
            }}>
            <option value="">Partir d&apos;un segment…</option>
            {segments.map(s => <option key={s.ID} value={s.ID}>{s.NOM}</option>)}
          </select>)}
        {/* Les bases se cochent : filtrer « Investisseurs » masquait en silence
            les 1 856 adresses du referentiel prospects. */}
        <MenuCases titre={basesChoisies.length === 0 ? "Toutes les bases"
            : basesChoisies.map(b => BASES.find(x => x.id === b)?.libelle).join(" ou ")}
          choix={BASES.map(b => ({ id: b.id, libelle: b.libelle }))}
          valeurs={basesChoisies}
          surChange={v => { setFiltre({ ...filtre, source: v.join(",") }); setPage(0); }} />

        {/* Les canaux se cumulent en OU : « qui puis-je atteindre par e-mail OU
            par telephone » demandait deux recherches. */}
        <MenuCases titre={canauxChoisis.length === 0 ? "Tout le référentiel"
            : canauxChoisis.length === CANAUX.length ? "Joignables"
            : canauxChoisis.map(c => CANAUX.find(x => x.id === c)?.libelle).join(" ou ")}
          choix={CANAUX.map(c => ({ id: c.id, libelle: c.libelle }))}
          valeurs={canauxChoisis}
          surChange={v => {
            // « joignable » quand les trois sont cochés : c'est la valeur que
            // portent les segments enregistrés, on la garde telle quelle.
            setFiltre({ ...filtre,
              canal: v.length === CANAUX.length ? "joignable" : v.join(",") });
            setPage(0);
          }} />

        <MenuCases titre={choisies.length
            ? `Langues : ${choisies.map(nomLangue).join(", ")}` : "Toutes les langues"}
          choix={languesDispo.map(l => ({ id: l.LANGUE, libelle: nomLangue(l.LANGUE), n: l.N }))}
          valeurs={choisies}
          surChange={v => { setFiltre({ ...filtre, langues: v.join(",") }); setPage(0); }} />

        <MenuCases
          titre={listeDe("pays").length ? `Pays : ${listeDe("pays").join(", ")}` : "Tous les pays"}
          choix={paysDispo.map(p => ({ id: p.VALEUR, libelle: p.VALEUR, n: p.N }))}
          valeurs={listeDe("pays")}
          surChange={v => { setFiltre({ ...filtre, pays: v.join(",") }); setPage(0); }} />

        <MenuCases
          titre={listeDe("secteur").length
            ? `Type : ${listeDe("secteur").length} coché(s)` : "Tous les types d'entreprise"}
          choix={secteurs.map(x => ({ id: x.id, libelle: x.libelle, n: x.n }))}
          valeurs={listeDe("secteur")} recherche
          surChange={v => { setFiltre({ ...filtre, secteur: v.join(",") }); setPage(0); }} />

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
