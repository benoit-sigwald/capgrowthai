import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import { MandatFournisseur, useMandat } from "@/lib/mandat";
import { nomBase, nomLangue } from "@/components/TableContacts";

type Membre = Record<string, string | number | null>;

function Membres({ listeId, nom, surFermer, surChange }: {
  listeId: number; nom: string; surFermer: () => void; surChange: () => void;
}) {
  const [rows, setRows] = useState<Membre[]>([]);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [recherche, setRecherche] = useState("");
  const [trouves, setTrouves] = useState<Membre[]>([]);
  const [renommer, setRenommer] = useState(nom);
  const [msg, setMsg] = useState("");

  const charger = useCallback(() => {
    fetch(`/capgrowth/api/listes/${listeId}`).then(r => r.json())
      .then(d => { setRows(d.rows || []); setCoches(new Set()); });
  }, [listeId]);
  useEffect(charger, [charger]);

  // Recherche dans le referentiel pour ajouter sans quitter la liste.
  useEffect(() => {
    if (recherche.trim().length < 2) { setTrouves([]); return; }
    const t = setTimeout(() => {
      fetch(`/capgrowth/api/personnes?canal=joignable&q=${encodeURIComponent(recherche)}`)
        .then(r => r.json()).then(d => setTrouves((d.rows || []).slice(0, 12)));
    }, 280);
    return () => clearTimeout(t);
  }, [recherche]);

  async function agir(methode: string, corps: unknown, libelle: string) {
    setMsg(libelle + "…");
    const r = await fetch(`/capgrowth/api/listes/${listeId}`, { method: methode,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return null; }
    setMsg(""); charger(); surChange(); return j;
  }

  return (
    <div style={{ border: "1px solid var(--hair)", borderRadius: "var(--r)",
      padding: 16, marginTop: 12, background: "var(--card)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input value={renommer} onChange={e => setRenommer(e.target.value)} style={{ width: 220 }} />
        <button className="btn" disabled={renommer.trim() === nom || !renommer.trim()}
          onClick={() => agir("PATCH", { nom: renommer }, "Renommage")}>Renommer</button>
        <span style={{ color: "var(--ink-3)" }}>{rows.length} membre(s)</span>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={surFermer}>Fermer</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input placeholder="Chercher un contact à ajouter…" value={recherche}
          onChange={e => setRecherche(e.target.value)} style={{ width: 280 }} />
        {coches.size > 0 && (
          <button className="btn" style={{ color: "var(--crit)" }}
            onClick={() => agir("DELETE", { person_keys: [...coches] }, "Retrait")}>
            Retirer {coches.size} de la liste</button>)}
        {msg && <span style={{ fontSize: 11, color: "var(--ink-2)", alignSelf: "center" }}>{msg}</span>}
      </div>

      {trouves.length > 0 && (
        <div style={{ background: "var(--bg-alt)", borderRadius: 12, padding: 10, marginBottom: 12 }}>
          {trouves.map(t => {
            const deja = rows.some(r => r.PERSON_KEY === t.PERSON_KEY);
            return (
              <div key={String(t.PERSON_KEY)} style={{ display: "flex", gap: 10,
                alignItems: "center", padding: "4px 0", fontSize: 11 }}>
                <span style={{ flex: 1 }}>
                  <b>{[t.FIRST_NAME, t.LAST_NAME].filter(Boolean).join(" ")}</b>
                  <span style={{ color: "var(--ink-2)" }}> · {t.COMPANY || "—"} · {t.EMAIL || "—"}</span>
                </span>
                <button className="btn" disabled={deja}
                  onClick={() => agir("POST", { person_keys: [t.PERSON_KEY] }, "Ajout")}>
                  {deja ? "déjà dedans" : "Ajouter"}</button>
              </div>);
          })}
        </div>)}

      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
        <thead><tr>
          <th style={{ padding: "6px 8px", borderBottom: "1px solid var(--hair-soft)" }}>
            <input type="checkbox"
              checked={rows.length > 0 && coches.size === rows.length}
              onChange={e => setCoches(e.target.checked
                ? new Set(rows.map(r => String(r.PERSON_KEY))) : new Set())} /></th>
          {["Nom", "Société", "E-mail", "Base", "Langues"].map(h =>
            <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10,
              color: "var(--ink-3)", borderBottom: "1px solid var(--hair-soft)" }}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(m => (
          <tr key={String(m.PERSON_KEY)} style={{ borderBottom: "1px solid var(--hair-soft)" }}>
            <td style={{ padding: "5px 8px" }}>
              <input type="checkbox" checked={coches.has(String(m.PERSON_KEY))}
                onChange={e => setCoches(s => { const n = new Set(s);
                  e.target.checked ? n.add(String(m.PERSON_KEY)) : n.delete(String(m.PERSON_KEY));
                  return n; })} /></td>
            <td style={{ padding: "5px 8px", fontWeight: 600 }}>
              {[m.FIRST_NAME, m.LAST_NAME].filter(Boolean).join(" ") || "—"}
              {m.OPT_OUT === 1 && <span className="pill crit" style={{ marginLeft: 4 }}>opt-out</span>}</td>
            <td style={{ padding: "5px 8px", color: "var(--ink-2)" }}>{m.COMPANY || "—"}</td>
            <td style={{ padding: "5px 8px" }}>{m.EMAIL || "—"}</td>
            <td style={{ padding: "5px 8px" }}><span className="pill">{nomBase(String(m.SOURCE))}</span></td>
            <td style={{ padding: "5px 8px" }}>{m.LANGUES
              ? String(m.LANGUES).split(",").map(l => nomLangue(l)).join(", ")
              : <span className="pill warn">inconnue</span>}</td>
          </tr>))}
          {!rows.length && <tr><td colSpan={6} style={{ padding: 18, textAlign: "center",
            color: "var(--ink-3)" }}>Liste vide — cherchez un contact ci-dessus, ou
            sélectionnez-en depuis l&apos;onglet « Tous les contacts ».</td></tr>}
        </tbody>
      </table>
    </div>);
}

function Listes() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [nom, setNom] = useState("");
  const [ouverte, setOuverte] = useState<{ id: number; nom: string } | null>(null);

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/listes?client=${mandat.ID}`).then(r => r.json())
      .then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);

  async function creer() {
    if (!nom || !mandat) return;
    await fetch(`/capgrowth/api/listes?client=${mandat.ID}`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: mandat.ID, nom }) });
    setNom(""); charger();
  }
  async function supprimer(id: number, libelle: string) {
    if (!confirm(`Supprimer la liste « ${libelle} » ? Les contacts eux-mêmes ne sont pas touchés.`)) return;
    await fetch(`/capgrowth/api/listes/${id}`, { method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supprimer_liste: true }) });
    if (ouverte?.id === id) setOuverte(null);
    charger();
  }

  return (<>
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input placeholder="Nom de la liste" value={nom} onChange={e => setNom(e.target.value)} />
      <button className="btn bleu" onClick={creer}>Créer</button>
    </div>
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
      <tbody>{rows.map(l => (
        <tr key={String(l.ID)} style={{ borderBottom: "1px solid var(--hair-soft)" }}>
          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{String(l.NOM)}</td>
          <td style={{ padding: "8px 12px", color: "var(--ink-2)" }}>{String(l.MEMBRES)} membre(s)</td>
          <td style={{ padding: "8px 12px", textAlign: "right" }}>
            <button className="btn" onClick={() => setOuverte(
              ouverte?.id === Number(l.ID) ? null : { id: Number(l.ID), nom: String(l.NOM) })}>
              {ouverte?.id === Number(l.ID) ? "Fermer" : "Ouvrir"}</button>
            <button className="btn" style={{ marginLeft: 6, color: "var(--crit)" }}
              onClick={() => supprimer(Number(l.ID), String(l.NOM))}>Supprimer</button>
          </td>
        </tr>))}
        {!rows.length && <tr><td colSpan={3} style={{ padding: 20, textAlign: "center",
          color: "var(--ink-3)" }}>Aucune liste sur ce mandat.</td></tr>}
      </tbody>
    </table>
    {ouverte && <Membres listeId={ouverte.id} nom={ouverte.nom}
      surFermer={() => setOuverte(null)} surChange={charger} />}
  </>);
}

export default function PageListes() {
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="listes" />
        <p style={{ color: "var(--ink-3)" }}>Une liste est figée : ce qu&apos;on y met y reste,
          jusqu&apos;à ce qu&apos;on l&apos;en retire. Pour un ciblage qui suit le référentiel,
          utilisez un segment. Supprimer une liste ne touche jamais les contacts eux-mêmes.</p>
        <Listes />
      </Coquille>
    </MandatFournisseur>
  );
}
