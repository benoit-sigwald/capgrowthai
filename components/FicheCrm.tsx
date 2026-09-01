import { useCallback, useEffect, useState } from "react";
import { useMandat } from "@/lib/mandat";
import { LIBELLES, STATUTS, TYPES_ACTION, MOTIFS_PERTE, CANAUX,
         TYPES_INTERACTION, exigeAction } from "@/lib/crm";

/*
 * La fiche du pipeline : l'etat du mandat, la frise, et la saisie de ce
 * qu'aucune machine ne voit.
 */
export default function FicheCrm({ personKey, onFermer, onChange }: {
  personKey: string; onFermer: () => void; onChange: () => void;
}) {
  const { mandat } = useMandat();
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  const [etat, setEtat] = useState<Record<string, string>>({});
  const [journal, setJournal] = useState({ canal: "appel", type: "appel", resume: "" });
  const [msg, setMsg] = useState("");

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/personnes/${encodeURIComponent(personKey)}?client=${mandat.ID}`)
      .then(r => r.json()).then(j => {
        setD(j);
        const f = j.fiche as Record<string, string>;
        setEtat({ statut: f.STATUT ?? "a_contacter", proprietaire: f.PROPRIETAIRE ?? "",
          action_type: f.ACTION_TYPE ?? "", motif_perte: f.MOTIF_PERTE ?? "",
          action_le: f.ACTION_LE ? new Date(f.ACTION_LE).toISOString().slice(0, 10) : "",
          action_note: f.ACTION_NOTE ?? "" });
      });
  }, [personKey, mandat]);
  useEffect(charger, [charger]);

  async function enregistrer() {
    setMsg("Enregistrement…");
    const r = await fetch(`/capgrowth/api/etat/${encodeURIComponent(personKey)}?client=${mandat?.ID}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(etat) });
    const j = await r.json();
    setMsg(r.ok ? "Enregistré." : j.erreur);
    if (r.ok) { charger(); onChange(); }
  }

  async function journaliser() {
    setMsg("Journalisation…");
    const r = await fetch(`/capgrowth/api/journal`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...journal, person_key: personKey, client: mandat?.ID }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    setMsg(""); setJournal({ ...journal, resume: "" }); charger(); onChange();
  }

  if (!d) return null;
  const f = d["fiche"] as Record<string, string | number | null>;
  const frise = (d["frise"] as Record<string, string>[]) || [];
  const nom = [f.FIRST_NAME, f.LAST_NAME].filter(Boolean).join(" ") || "—";

  return (
    <aside style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 430, overflowY: "auto",
      background: "var(--card)", borderLeft: "1px solid var(--hair-soft)",
      boxShadow: "var(--shadow)", padding: 24, zIndex: 40 }}>
      <button className="btn" style={{ float: "right" }} onClick={onFermer}>×</button>
      <h2 style={{ fontSize: 17 }}>{nom}</h2>
      <div style={{ color: "var(--ink-2)", marginBottom: 6 }}>
        {f.COMPANY || "—"}{f.TITLE ? ` · ${f.TITLE}` : ""}</div>
      <div style={{ marginBottom: 14, fontSize: 11 }}>
        {f.EMAIL && <span>{f.EMAIL}</span>}
        {f.PHONE && <span> · {f.PHONE}</span>}
        {f.LINKEDIN_URL && <> · <a href={String(f.LINKEDIN_URL)} target="_blank"
          rel="noopener noreferrer">LinkedIn</a></>}
      </div>

      <h3 style={{ fontSize: 10, color: "var(--ink-3)", margin: "6px 0" }}>
        État sur ce mandat</h3>
      <div style={{ display: "grid", gap: 8 }}>
        <select value={etat.statut} onChange={e => setEtat({ ...etat, statut: e.target.value })}>
          {STATUTS.map(s => <option key={s} value={s}>{LIBELLES[s][0]}</option>)}
        </select>
        {exigeAction(etat.statut) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select value={etat.action_type} onChange={e => setEtat({ ...etat, action_type: e.target.value })}>
              <option value="">action…</option>
              {TYPES_ACTION.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="date" value={etat.action_le}
              onChange={e => setEtat({ ...etat, action_le: e.target.value })} />
          </div>)}
        {etat.statut === "perdu" && (
          <select value={etat.motif_perte} onChange={e => setEtat({ ...etat, motif_perte: e.target.value })}>
            <option value="">motif de perte…</option>
            {MOTIFS_PERTE.map(m => <option key={m} value={m}>{m}</option>)}
          </select>)}
        <input placeholder="Propriétaire" value={etat.proprietaire}
          onChange={e => setEtat({ ...etat, proprietaire: e.target.value })} />
        <input placeholder="Note d'action" value={etat.action_note}
          onChange={e => setEtat({ ...etat, action_note: e.target.value })} />
        <button className="btn bleu" onClick={enregistrer}>Enregistrer l&apos;état</button>
      </div>

      <h3 style={{ fontSize: 10, color: "var(--ink-3)", margin: "18px 0 6px" }}>
        Journal — l&apos;appel, la note, la rencontre</h3>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <select value={journal.canal} onChange={e => setJournal({ ...journal, canal: e.target.value })}>
            {CANAUX.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <select value={journal.type} onChange={e => setJournal({ ...journal, type: e.target.value })}>
            {TYPES_INTERACTION.map(t => <option key={t} value={t}>{t}</option>)}</select>
        </div>
        <input placeholder="Ce qui s'est dit" value={journal.resume}
          onChange={e => setJournal({ ...journal, resume: e.target.value })} />
        <button className="btn" onClick={journaliser}>Journaliser</button>
      </div>
      {msg && <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 8 }}>{msg}</div>}

      <h3 style={{ fontSize: 10, color: "var(--ink-3)", margin: "18px 0 6px" }}>
        Frise ({frise.length})</h3>
      {frise.length ? frise.map((i, n) => (
        <div key={n} style={{ padding: "6px 0", borderBottom: "1px solid var(--hair-soft)",
          fontSize: 11, borderLeft: i.SENS === "entrant" ? "2px solid var(--ok)" : "none",
          paddingLeft: i.SENS === "entrant" ? 8 : 0 }}>
          <b>{i.TYPE}</b> · {i.CANAL} · {new Date(i.QUAND).toLocaleString("fr-FR",
            { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          {i.CAMPAGNE && <span className="pill" style={{ marginLeft: 6 }}>{i.CAMPAGNE}</span>}
          {i.RESUME && <div style={{ color: "var(--ink-2)" }}>{i.RESUME}</div>}
        </div>
      )) : <div style={{ color: "var(--ink-3)", fontSize: 11 }}>Aucune interaction.</div>}
    </aside>
  );
}
