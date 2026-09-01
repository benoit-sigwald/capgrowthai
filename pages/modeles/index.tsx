import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

type Modele = Record<string, string | number | null>;

function Modeles() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Modele[]>([]);
  const [ed, setEd] = useState<Modele | null>(null);
  const [msg, setMsg] = useState("");

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/modeles?client=${mandat.ID}`).then(r => r.json())
      .then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);

  async function enregistrer() {
    if (!ed) return;
    setMsg("Enregistrement…");
    const r = await fetch(`/capgrowth/api/modeles?client=${mandat?.ID}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: ed.TEMPLATE_ID, nom: ed.NAME, langue: ed.LANGUAGE,
        sujet: ed.SUBJECT, corps: ed.CORPS, actif: ed.IS_ACTIVE }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    setMsg("Enregistré — nouvelle version."); setEd(null); charger();
  }

  return (<>
    <button className="btn bleu" style={{ marginBottom: 14 }}
      onClick={() => setEd({ TEMPLATE_ID: "", NAME: "", LANGUAGE: "fr", SUBJECT: "",
        CORPS: "", IS_ACTIVE: 1, CLIENT_ID: mandat?.ID ?? null })}>Nouveau gabarit</button>

    {rows.map(m => (
      <div key={String(m.TEMPLATE_ID)} style={{ padding: "10px 0",
        borderBottom: "1px solid var(--hair-soft)", display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{m.NAME || m.TEMPLATE_ID}</b>{" "}
          <span className="pill">{m.LANGUAGE}</span>{" "}
          <span className="pill">v{m.VERSION}</span>{" "}
          <span className={`pill ${m.IS_ACTIVE ? "ok" : ""}`}>{m.IS_ACTIVE ? "actif" : "inactif"}</span>{" "}
          <span className={`pill ${m.CLIENT_ID ? "" : "warn"}`}>
            {m.CLIENT_ID ? "ce mandat" : "partagé Arx"}</span>
          <div style={{ color: "var(--ink-2)", fontSize: 11 }}>{m.SUBJECT}</div>
        </div>
        <button className="btn" onClick={() => setEd({ ...m })}>Ouvrir</button>
      </div>))}
    {!rows.length && <p style={{ color: "var(--ink-3)" }}>Aucun gabarit.</p>}

    {ed && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.25)", zIndex: 50,
        display: "grid", placeItems: "center" }} onClick={() => setEd(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: "var(--card)",
          borderRadius: "var(--r)", padding: 22, width: "min(720px, 92vw)",
          maxHeight: "88vh", overflowY: "auto", display: "grid", gap: 10 }}>
          <b style={{ fontSize: 13 }}>{ed.TEMPLATE_ID ? `Gabarit ${ed.TEMPLATE_ID}` : "Nouveau gabarit"}</b>
          {!ed.TEMPLATE_ID && <input placeholder="Identifiant (ex. super-cannes-fr)"
            value={String(ed.TEMPLATE_ID ?? "")}
            onChange={e => setEd({ ...ed, TEMPLATE_ID: e.target.value })} />}
          <input placeholder="Nom" value={String(ed.NAME ?? "")}
            onChange={e => setEd({ ...ed, NAME: e.target.value })} />
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8 }}>
            <select value={String(ed.LANGUAGE ?? "fr")}
              onChange={e => setEd({ ...ed, LANGUAGE: e.target.value })}>
              <option value="fr">fr</option><option value="en">en</option>
            </select>
            <input placeholder="Objet" value={String(ed.SUBJECT ?? "")}
              onChange={e => setEd({ ...ed, SUBJECT: e.target.value })} />
          </div>
          <textarea rows={16} style={{ width: "100%", fontFamily: "monospace", fontSize: 11 }}
            value={String(ed.CORPS ?? "")} onChange={e => setEd({ ...ed, CORPS: e.target.value })} />
          <div style={{ fontSize: 10, color: "var(--ink-3)" }}>
            Variables reconnues par le moteur d&apos;envoi : <code>{"{{first_name}}"}</code>,{" "}
            <code>{"{{last_name}}"}</code>, <code>{"{{link}}"}</code>. Enregistrer crée une
            <b> nouvelle version</b> — les envois passés gardent le contenu qui leur a été appliqué.
          </div>
          <label style={{ fontSize: 11 }}>
            <input type="checkbox" checked={!!ed.IS_ACTIVE}
              onChange={e => setEd({ ...ed, IS_ACTIVE: e.target.checked ? 1 : 0 })} /> actif
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn bleu" onClick={enregistrer}>Enregistrer</button>
            <button className="btn" onClick={() => setEd(null)}>Fermer</button>
          </div>
          {msg && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{msg}</span>}
        </div>
      </div>)}
  </>);
}

export default function PageModeles() {
  return (
    <MandatFournisseur>
      <Coquille section="modeles">
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Modèles</h1>
        <p style={{ color: "var(--ink-3)", marginBottom: 14 }}>
          Un gabarit du mandat prime sur un gabarit partagé de même langue. Ils sont
          <b> versionnés et jamais supprimés</b> : un envoi passé doit garder la trace du
          contenu exact qui lui a été appliqué. Désactiver, oui ; effacer, non.</p>
        <Modeles />
      </Coquille>
    </MandatFournisseur>
  );
}
