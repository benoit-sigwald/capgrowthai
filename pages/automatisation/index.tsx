import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";
import { STATUTS, LIBELLES, TYPES_ACTION } from "@/lib/crm";

const LIB_DECL: Record<string, string> = {
  reponse: "quelqu'un a répondu",
  clic: "quelqu'un a cliqué",
  rebond: "un message a rebondi",
  inscription: "quelqu'un s'est inscrit par formulaire",
  sans_reponse: "contacté depuis N jours et toujours muet",
};
const LIB_ACTION: Record<string, string> = {
  tache: "poser une tâche datée",
  statut: "changer le statut",
  notifier: "envoyer une notification",
};

function Regles() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Record<string, never>[]>([]);
  const [f, setF] = useState({ nom: "", declencheur: "reponse", delai_jours: 7,
    action: "tache", action_param: "relance", action_delai_jours: 2 });
  const [msg, setMsg] = useState("");

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/automatisations?client=${mandat.ID}`).then(r => r.json())
      .then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);

  async function enregistrer(corps: Record<string, unknown>) {
    const r = await fetch(`/capgrowth/api/automatisations?client=${mandat?.ID}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps) });
    const j = await r.json();
    setMsg(r.ok ? "" : j.erreur); if (r.ok) charger();
  }
  async function supprimer(id: number) {
    await fetch(`/capgrowth/api/automatisations?client=${mandat?.ID}&id=${id}`, { method: "DELETE" });
    charger();
  }

  return (<>
    <div style={{ background: "var(--bg-alt)", borderRadius: "var(--r)", padding: 16,
      marginBottom: 18, display: "grid", gap: 10, maxWidth: 720 }}>
      <b style={{ fontSize: 12 }}>Nouvelle règle</b>
      <input placeholder="Nom de la règle" value={f.nom}
        onChange={e => setF({ ...f, nom: e.target.value })} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Quand</span>
        <select value={f.declencheur} onChange={e => setF({ ...f, declencheur: e.target.value })}>
          {Object.entries(LIB_DECL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {f.declencheur === "sans_reponse" && (
          <input type="number" style={{ width: 70 }} value={f.delai_jours}
            onChange={e => setF({ ...f, delai_jours: Number(e.target.value) })} />)}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Alors</span>
        <select value={f.action} onChange={e => setF({ ...f, action: e.target.value,
          action_param: e.target.value === "statut" ? "a_reveiller" : "relance" })}>
          {Object.entries(LIB_ACTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {f.action === "statut" && (
          <select value={f.action_param} onChange={e => setF({ ...f, action_param: e.target.value })}>
            {STATUTS.map(s => <option key={s} value={s}>{LIBELLES[s][0]}</option>)}
          </select>)}
        {f.action === "tache" && (<>
          <select value={f.action_param} onChange={e => setF({ ...f, action_param: e.target.value })}>
            {TYPES_ACTION.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>dans</span>
          <input type="number" style={{ width: 70 }} value={f.action_delai_jours}
            onChange={e => setF({ ...f, action_delai_jours: Number(e.target.value) })} />
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>jours</span>
        </>)}
        {f.action === "notifier" && (
          <input placeholder="Titre de la notification" value={f.action_param}
            onChange={e => setF({ ...f, action_param: e.target.value })} />)}
      </div>
      <button className="btn bleu" disabled={!f.nom}
        onClick={() => enregistrer(f)}>Créer la règle</button>
      {msg && <span style={{ color: "var(--crit)", fontSize: 11 }}>{msg}</span>}
    </div>

    {rows.map(r => (
      <div key={r["ID"]} style={{ padding: "12px 0", borderBottom: "1px solid var(--hair-soft)",
        display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <b>{r["NOM"]}</b>{" "}
          <span className={`pill ${r["ACTIF"] ? "ok" : ""}`}>{r["ACTIF"] ? "active" : "arrêtée"}</span>
          <div style={{ color: "var(--ink-2)", fontSize: 11 }}>
            Quand {LIB_DECL[r["DECLENCHEUR"]] ?? r["DECLENCHEUR"]}
            {r["DECLENCHEUR"] === "sans_reponse" ? ` (${r["DELAI_JOURS"]} j)` : ""}
            {" → "}{LIB_ACTION[r["ACTION"]] ?? r["ACTION"]}
            {r["ACTION_PARAM"] ? ` « ${r["ACTION_PARAM"]} »` : ""}
          </div>
          <div style={{ color: "var(--ink-3)", fontSize: 10 }}>
            {r["TOTAL_DECLENCHE"]} déclenchement(s) au total
            {r["DERNIER_PASSAGE"] ? ` · dernier passage ${new Date(String(r["DERNIER_PASSAGE"])).toLocaleString("fr-FR")}` : " · jamais passée"}
          </div>
        </div>
        <button className="btn" onClick={() => enregistrer({ nom: r["NOM"],
          declencheur: r["DECLENCHEUR"], delai_jours: r["DELAI_JOURS"], action: r["ACTION"],
          action_param: r["ACTION_PARAM"], action_delai_jours: r["ACTION_DELAI_JOURS"],
          actif: r["ACTIF"] ? 0 : 1 })}>{r["ACTIF"] ? "Arrêter" : "Activer"}</button>
        <button className="btn" style={{ color: "var(--crit)" }}
          onClick={() => supprimer(Number(r["ID"]))}>Supprimer</button>
      </div>))}
    {!rows.length && <p style={{ color: "var(--ink-3)" }}>Aucune règle sur ce mandat.</p>}
  </>);
}

export default function PageAutomatisation() {
  return (
    <MandatFournisseur>
      <Coquille section="automatisation">
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Automatisation</h1>
        <p style={{ color: "var(--ink-3)", marginBottom: 14 }}>
          Les règles passent en revue <b>toutes les heures</b> — la latence est d&apos;au plus
          une heure, et c&apos;est dit ici plutôt que promis en temps réel. Une règle ne se
          déclenche qu&apos;<b>une fois par personne</b>, et <b>n&apos;envoie jamais de message</b> :
          elle pose une tâche, change un statut ou notifie.
        </p>
        <Regles />
      </Coquille>
    </MandatFournisseur>
  );
}
