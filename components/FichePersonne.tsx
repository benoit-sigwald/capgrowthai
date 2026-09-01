import { useEffect, useState, useCallback } from "react";
import { useMandat } from "@/lib/mandat";
import { nomBase } from "./TableContacts";

const CHAMPS: [string, string][] = [["prenom", "Prénom"], ["nom", "Nom"], ["titre", "Titre"],
  ["societe", "Société"], ["email", "E-mail"], ["telephone", "Téléphone"],
  ["linkedin", "LinkedIn"], ["ville", "Ville"], ["pays", "Pays"], ["notes", "Notes"]];
const COLONNE: Record<string, string> = { prenom: "FIRST_NAME", nom: "LAST_NAME", titre: "TITLE",
  societe: "COMPANY", email: "EMAIL", telephone: "PHONE", linkedin: "LINKEDIN_URL",
  ville: "CITY", pays: "COUNTRY", notes: "NOTES" };

export default function FichePersonne({ personKey, admin, onFermer, onChange }: {
  personKey: string; admin: boolean; onFermer: () => void; onChange: () => void;
}) {
  const { mandat } = useMandat();
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");
  const [msg, setMsg] = useState("");

  const charger = useCallback(() => {
    fetch(`/capgrowth/api/personnes/${encodeURIComponent(personKey)}?client=${mandat?.ID ?? 0}`)
      .then(r => r.json()).then(setD);
  }, [personKey, mandat]);
  useEffect(charger, [charger]);

  async function enregistrer(champ: string) {
    setMsg("Enregistrement…");
    const r = await fetch(`/capgrowth/api/personnes/${encodeURIComponent(personKey)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ champ, valeur: brouillon }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    setMsg("Écrit à la source."); setEnEdition(null); charger(); onChange();
  }

  async function supprimer() {
    if (!confirm("Supprimer définitivement ce contact du référentiel ?")) return;
    const r = await fetch(`/capgrowth/api/personnes/${encodeURIComponent(personKey)}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    onFermer(); onChange();
  }

  if (!d) return null;
  const fiche = d["fiche"] as Record<string, string | number | null>;
  const frise = (d["frise"] as Record<string, string>[]) || [];
  return (
    <aside style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 420, overflowY: "auto",
      background: "var(--card)", borderLeft: "1px solid var(--hair-soft)",
      boxShadow: "var(--shadow)", padding: 24, zIndex: 30 }}>
      <button className="btn" style={{ float: "right" }} onClick={onFermer}>×</button>
      <h2 style={{ fontSize: 17 }}>{[fiche.FIRST_NAME, fiche.LAST_NAME].filter(Boolean).join(" ") || "—"}</h2>
      <div style={{ color: "var(--ink-3)", marginBottom: 14 }}>
        <span className="pill">{nomBase(String(fiche.SOURCE))}</span>
      </div>

      <h3 style={{ fontSize: 10, color: "var(--ink-3)", margin: "14px 0 8px" }}>
        Référentiel — l&apos;édition écrit à la source</h3>
      <dl style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "5px 10px", margin: 0 }}>
        {CHAMPS.map(([champ, libelle]) => (
          <FragmentChamp key={champ} libelle={libelle}
            valeur={fiche[COLONNE[champ]] as string | null}
            enEdition={enEdition === champ} brouillon={brouillon}
            surEdition={() => { setEnEdition(champ); setBrouillon(String(fiche[COLONNE[champ]] ?? "")); }}
            surBrouillon={setBrouillon} surOk={() => enregistrer(champ)}
            surAnnule={() => setEnEdition(null)} />
        ))}
      </dl>
      {msg && <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 6 }}>{msg}</div>}

      <h3 style={{ fontSize: 10, color: "var(--ink-3)", margin: "18px 0 8px" }}>Frise</h3>
      {frise.length ? frise.map((i, n) => (
        <div key={n} style={{ padding: "6px 0", borderBottom: "1px solid var(--hair-soft)", fontSize: 11 }}>
          <b>{i.TYPE}</b> · {i.CANAL} · {new Date(i.QUAND).toLocaleString("fr-FR",
            { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          {i.CAMPAGNE && <span className="pill" style={{ marginLeft: 6 }}>{i.CAMPAGNE}</span>}
          {i.RESUME && <div style={{ color: "var(--ink-2)" }}>{i.RESUME}</div>}
        </div>
      )) : <div style={{ color: "var(--ink-3)", fontSize: 11 }}>Aucune interaction.</div>}

      {admin && <button className="btn" style={{ marginTop: 20, color: "var(--crit)" }}
        onClick={supprimer}>Supprimer (admin)</button>}
    </aside>
  );
}

function FragmentChamp({ libelle, valeur, enEdition, brouillon,
  surEdition, surBrouillon, surOk, surAnnule }: {
  libelle: string; valeur: string | null; enEdition: boolean; brouillon: string;
  surEdition: () => void; surBrouillon: (v: string) => void; surOk: () => void; surAnnule: () => void;
}) {
  return (<>
    <dt style={{ color: "var(--ink-3)", fontSize: 10, alignSelf: "center" }}>{libelle}</dt>
    <dd style={{ margin: 0 }}>
      {enEdition ? (
        <span style={{ display: "flex", gap: 4 }}>
          <input value={brouillon} onChange={e => surBrouillon(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === "Enter") surOk(); if (e.key === "Escape") surAnnule(); }}
            style={{ flex: 1, padding: "4px 8px" }} />
          <button className="btn" onClick={surOk}>✓</button>
        </span>
      ) : (
        <span onClick={surEdition} title="Cliquer pour corriger — écrit dans la table d'origine"
          style={{ cursor: "text", display: "block", minHeight: 16 }}>{valeur || <i style={{ color: "var(--ink-3)" }}>—</i>}</span>
      )}
    </dd>
  </>);
}
