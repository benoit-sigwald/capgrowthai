import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

type Reponse = Record<string, string | number | null>;

const quand = (v: string | number | null) =>
  v ? new Date(String(v)).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

/*
 * Les reponses recues.
 *
 * Une ouverture se compte, une reponse s'honore : c'est le seul evenement
 * d'une campagne qui attend quelque chose de nous. Elle dormait pourtant dans
 * une colonne que rien n'affichait.
 */
function Reponses() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Reponse[]>([]);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");
  const [consigne, setConsigne] = useState("");
  const [ia, setIa] = useState(false);
  const [msg, setMsg] = useState("");

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/reponses?client=${mandat.ID}`).then(r => r.json())
      .then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);

  async function rafraichir() {
    setMsg("Relève de la boîte de réception…");
    const r = await fetch(`/capgrowth/api/rafraichir`, { method: "POST" });
    const j = await r.json();
    setMsg(r.ok ? j.resume : j.erreur);
    charger();
  }

  async function proposer(r: Reponse) {
    setIa(true); setMsg("L'IA rédige une proposition…");
    const rep = await fetch(`/capgrowth/api/redaction`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "reponse", recu: String(r.REPLY_SNIPPET ?? ""),
        contexte: `Campagne « ${r.CAMPAGNE} », objet « ${r.RENDERED_SUBJECT} ».`
          + ` Contact : ${[r.FIRST_NAME, r.LAST_NAME].filter(Boolean).join(" ") || r.EMAIL}`
          + (r.COMPANY ? `, ${r.COMPANY}` : ""),
        consigne }) });
    const j = await rep.json();
    setIa(false);
    if (!rep.ok) { setMsg(j.erreur); return; }
    setBrouillon(j.html);
    setMsg("Proposition affichée — relisez et corrigez, rien n'est parti.");
  }

  async function envoyer(r: Reponse) {
    if (!brouillon.trim()) return;
    if (!confirm(`Envoyer cette réponse à ${r.EMAIL} ?`)) return;
    setMsg("Envoi…");
    const rep = await fetch(`/capgrowth/api/reponses?client=${mandat?.ID}`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ send_id: r.SEND_ID, corps: brouillon }) });
    const j = await rep.json();
    if (!rep.ok) { setMsg(j.erreur); return; }
    setMsg(`Envoyé à ${j.destinataire} depuis ${j.expediteur} — objet « ${j.sujet} ».`);
    setBrouillon(""); setConsigne(""); setOuverte(null); charger();
  }

  return (<>
    <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
      <button className="btn" onClick={rafraichir}>Relever les nouvelles réponses</button>
      {msg && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{msg}</span>}
    </div>

    {rows.map(r => {
      const id = String(r.SEND_ID);
      const nom = [r.FIRST_NAME, r.LAST_NAME].filter(Boolean).join(" ") || String(r.EMAIL);
      return (
        <div key={id} style={{ border: "1px solid var(--hair-soft)", borderRadius: "var(--r)",
          padding: 14, marginBottom: 10, background: "var(--card)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <b>{nom}</b>
            <span style={{ color: "var(--ink-2)", fontSize: 11 }}>{String(r.EMAIL)}</span>
            {r.COMPANY && <span className="pill">{String(r.COMPANY)}</span>}
            <span className="pill">{String(r.CAMPAGNE)}</span>
            {r.HORS_MANDAT === 1 && <span className="pill warn">campagne sans mandat</span>}
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{quand(r.REPLIED_AT)}</span>
            {r.REPONDU_LE
              ? <span className="pill ok">répondu le {quand(r.REPONDU_LE)}</span>
              : <span className="pill warn">sans réponse</span>}
            <button className="btn" style={{ marginLeft: "auto" }}
              onClick={() => { setOuverte(ouverte === id ? null : id); setBrouillon("");
                setConsigne(""); setMsg(""); }}>
              {ouverte === id ? "Fermer" : "Répondre"}</button>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
            en réponse à « {String(r.RENDERED_SUBJECT)} »</div>
          <blockquote style={{ margin: "8px 0 0", padding: "8px 12px",
            borderLeft: "3px solid var(--hair)", background: "var(--bg-alt)",
            borderRadius: 6, fontSize: 12, whiteSpace: "pre-wrap" }}>
            {String(r.REPLY_SNIPPET ?? "(message vide)")}
          </blockquote>

          {ouverte === id && (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input style={{ flex: 1, minWidth: 220 }} value={consigne}
                  placeholder="Optionnel : « propose un appel jeudi », « décline poliment »…"
                  onChange={e => setConsigne(e.target.value)} />
                <button className="btn" disabled={ia} onClick={() => proposer(r)}>
                  {ia ? "…" : "Proposer une réponse (IA)"}</button>
              </div>
              <textarea rows={9} value={brouillon} placeholder="Votre réponse…"
                onChange={e => setBrouillon(e.target.value)}
                style={{ width: "100%", fontSize: 12 }} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn bleu" disabled={!brouillon.trim()}
                  onClick={() => envoyer(r)}>Envoyer</button>
                <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
                  Part depuis {String(r.EXPEDITEUR_EMAIL)} — l&apos;adresse à laquelle cette
                  personne a écrit. Objet : « Re: {String(r.RENDERED_SUBJECT)} ».
                </span>
              </div>
            </div>)}
        </div>);
    })}
    {!rows.length && <p style={{ color: "var(--ink-3)" }}>
      Aucune réponse reçue sur ce mandat. Elles arrivent par la relève de la boîte
      d&apos;envoi, une fois par heure.</p>}
  </>);
}

export default function PageReponses() {
  return (
    <MandatFournisseur>
      <Coquille section="reponses">
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Réponses</h1>
        <p style={{ color: "var(--ink-3)", marginBottom: 14 }}>
          Une ouverture se compte, une réponse s&apos;honore. Ce qui part d&apos;ici s&apos;envoie
          sous l&apos;adresse de la campagne — celle à laquelle la personne a écrit — et laisse
          une trace dans le CRM. L&apos;IA propose ; vous relisez et vous envoyez.</p>
        <Reponses />
      </Coquille>
    </MandatFournisseur>
  );
}
