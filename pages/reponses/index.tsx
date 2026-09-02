import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

type Reponse = Record<string, string | number | null>;

const quand = (v: string | number | null) =>
  v ? new Date(String(v)).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";
const jour = (v: string | number | null) =>
  v ? new Date(String(v)).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "";

const initiales = (nom: string) => nom.trim().split(/\s+/).slice(0, 2)
  .map(m => m[0]?.toUpperCase() ?? "").join("") || "?";

/*
 * Les reponses recues, presentees comme une messagerie : la liste a gauche, le
 * message a droite.
 *
 * Le premier jet empilait des cartes sur toute la largeur. On ne lit pas un
 * echange comme on lit un tableau : il faut voir d'un coup ce qui attend une
 * reponse, et lire un message sans perdre cette vue.
 */
function Reponses() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Reponse[]>([]);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");
  const [consigne, setConsigne] = useState("");
  const [ia, setIa] = useState(false);
  const [msg, setMsg] = useState("");
  // Par defaut, ce qui attend une reponse : une liste ou le traite et le
  // non-traite se melangent ne dit plus ce qu'il reste a faire.
  const [filtre, setFiltre] = useState<"a_traiter" | "toutes">("a_traiter");
  const [options, setOptions] = useState(false);
  const [reglages, setReglages] = useState<Record<string, string>>({});

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/reponses?client=${mandat.ID}`).then(r => r.json())
      .then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);
  useEffect(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/reglages-ia?client=${mandat.ID}`).then(r => r.json())
      .then(d => setReglages(d.reglages || {}));
  }, [mandat]);

  const visibles = rows.filter(r => filtre === "toutes" || !r.REPONDU_LE);
  const courant = rows.find(r => String(r.SEND_ID) === choisi) || null;

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
      body: JSON.stringify({ mode: "reponse", client: mandat?.ID,
        recu: String(r.REPLY_SNIPPET ?? ""),
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
    setMsg(`Envoyé à ${j.destinataire} depuis ${j.expediteur}.`);
    setBrouillon(""); setConsigne(""); charger();
  }

  return (<>
    <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center",
      flexWrap: "wrap" }}>
      <button className="btn" onClick={rafraichir}>Relever les nouvelles réponses</button>
      <select value={filtre} onChange={e => setFiltre(e.target.value as typeof filtre)}>
        <option value="a_traiter">À traiter ({rows.filter(r => !r.REPONDU_LE).length})</option>
        <option value="toutes">Toutes ({rows.length})</option>
      </select>
      <button className="btn" onClick={() => setOptions(!options)}>
        {options ? "Fermer les options" : "Options des réponses IA"}</button>
      {msg && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{msg}</span>}
    </div>

    {options && <OptionsIa reglages={reglages} surChange={setReglages}
      client={mandat?.ID} surMessage={setMsg} />}

    <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr",
      gap: 0, border: "1px solid var(--hair-soft)", borderRadius: "var(--r)",
      overflow: "hidden", background: "var(--card)", minHeight: "62vh" }}>

      {/* Colonne des echanges */}
      <div style={{ borderRight: "1px solid var(--hair-soft)", overflowY: "auto",
        maxHeight: "72vh", background: "var(--bg-alt)" }}>
        {visibles.map(r => {
          const id = String(r.SEND_ID);
          const nom = [r.FIRST_NAME, r.LAST_NAME].filter(Boolean).join(" ") || String(r.EMAIL);
          const actif = id === choisi;
          return (
            <div key={id} onClick={() => { setChoisi(id); setBrouillon(""); setConsigne(""); setMsg(""); }}
              style={{ display: "flex", gap: 10, padding: "10px 12px", cursor: "pointer",
                borderBottom: "1px solid var(--hair-soft)",
                background: actif ? "var(--card)" : "transparent" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: "var(--hair)", color: "var(--ink-2)", display: "grid",
                placeItems: "center", fontSize: 11, fontWeight: 600 }}>{initiales(nom)}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{ fontWeight: r.REPONDU_LE ? 400 : 700, fontSize: 12,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nom}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)",
                    whiteSpace: "nowrap" }}>{jour(r.REPLIED_AT)}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-2)", overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {String(r.RENDERED_SUBJECT ?? "")}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {String(r.REPLY_SNIPPET ?? "").replace(/\s+/g, " ").slice(0, 70)}</div>
              </div>
            </div>);
        })}
        {!visibles.length && <p style={{ padding: 16, color: "var(--ink-3)", fontSize: 12 }}>
          {rows.length ? "Tout est traité. Passez à « Toutes » pour relire les échanges."
                       : "Aucune réponse reçue sur ce mandat."}</p>}
      </div>

      {/* Le message */}
      <div style={{ padding: 20, overflowY: "auto", maxHeight: "72vh" }}>
        {!courant && <p style={{ color: "var(--ink-3)", fontSize: 12 }}>
          Choisissez un échange à gauche.</p>}
        {courant && (<>
          <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>
            {String(courant.RENDERED_SUBJECT ?? "")}</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
            paddingBottom: 12, borderBottom: "1px solid var(--hair-soft)" }}>
            <b style={{ fontSize: 13 }}>
              {[courant.FIRST_NAME, courant.LAST_NAME].filter(Boolean).join(" ")
                || String(courant.EMAIL)}</b>
            <span style={{ fontSize: 11, color: "var(--ink-2)" }}>
              &lt;{String(courant.EMAIL)}&gt; à {String(courant.EXPEDITEUR_EMAIL)}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>
              {quand(courant.REPLIED_AT)}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
            {courant.COMPANY && <span className="pill">{String(courant.COMPANY)}</span>}
            <span className="pill">{String(courant.CAMPAGNE)}</span>
            {courant.HORS_MANDAT === 1 && <span className="pill warn">campagne sans mandat</span>}
            {courant.REPONDU_LE
              ? <span className="pill ok">répondu le {quand(courant.REPONDU_LE)}</span>
              : <span className="pill warn">sans réponse</span>}
          </div>

          <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap",
            padding: "4px 0 14px" }}>
            {String(courant.REPLY_SNIPPET ?? "(message vide)")}
          </div>

          {courant.MA_REPONSE && (
            <div style={{ borderTop: "1px solid var(--hair-soft)", paddingTop: 12,
              marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 6 }}>
                Votre réponse, le {quand(courant.REPONDU_LE)}</div>
              <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap",
                color: "var(--ink-2)" }}>{String(courant.MA_REPONSE)}</div>
            </div>)}

          <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--hair-soft)",
            paddingTop: 12 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input style={{ flex: 1, minWidth: 200 }} value={consigne}
                placeholder="Optionnel : « propose un appel jeudi », « décline poliment »…"
                onChange={e => setConsigne(e.target.value)} />
              <button className="btn" disabled={ia} onClick={() => proposer(courant)}>
                {ia ? "…" : "Proposer une réponse (IA)"}</button>
            </div>
            <textarea rows={8} value={brouillon} placeholder="Votre réponse…"
              onChange={e => setBrouillon(e.target.value)}
              style={{ width: "100%", fontSize: 13 }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn bleu" disabled={!brouillon.trim()}
                onClick={() => envoyer(courant)}>Envoyer</button>
              <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
                Part depuis {String(courant.EXPEDITEUR_EMAIL)} — l&apos;adresse à laquelle cette
                personne a écrit. Objet : « Re: {String(courant.RENDERED_SUBJECT)} ».
              </span>
            </div>
          </div>
        </>)}
      </div>
    </div>
  </>);
}

/*
 * Options de redaction, par MANDAT et non par personne : deux collaborateurs
 * qui repondent aux memes investisseurs doivent ecrire de la meme facon. C'est
 * la voix de la maison, pas une preference d'utilisateur.
 */
function OptionsIa({ reglages, surChange, client, surMessage }: {
  reglages: Record<string, string>;
  surChange: (r: Record<string, string>) => void;
  client?: number;
  surMessage: (m: string) => void;
}) {
  const [v, setV] = useState(reglages);
  useEffect(() => setV(reglages), [reglages]);
  const champ = (cle: string, valeur: string) => setV({ ...v, [cle]: valeur });

  return (
    <div style={{ border: "1px solid var(--hair)", borderRadius: "var(--r)", padding: 14,
      marginBottom: 14, display: "grid", gap: 10, background: "var(--card)" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 11 }}>Ton{" "}
          <select value={v.TON || "formel"} onChange={e => champ("TON", e.target.value)}>
            <option value="formel">formel — vouvoiement, distance courtoise</option>
            <option value="cordial">cordial — professionnel et chaleureux</option>
            <option value="direct">direct — va au fait, formules gardées</option>
          </select></label>
        <label style={{ fontSize: 11 }}>Longueur{" "}
          <select value={v.LONGUEUR || "bref"} onChange={e => champ("LONGUEUR", e.target.value)}>
            <option value="bref">brève — 3 à 5 phrases</option>
            <option value="standard">standard — 1 à 2 paragraphes</option>
            <option value="detaille">détaillée — 3 paragraphes au plus</option>
          </select></label>
        <label style={{ fontSize: 11 }}>Langue{" "}
          <select value={v.LANGUE || "auto"} onChange={e => champ("LANGUE", e.target.value)}>
            <option value="auto">celle du message reçu</option>
            <option value="fr">français</option><option value="en">anglais</option>
          </select></label>
      </div>
      <input placeholder="Formule d'appel imposée — ex. « Madame, Monsieur, » (vide : choisie selon le cas)"
        value={v.APPEL || ""} onChange={e => champ("APPEL", e.target.value)} />
      <input placeholder="Formule de congé imposée — ex. « Je vous prie d'agréer… » (vide : d'usage)"
        value={v.CONGE || ""} onChange={e => champ("CONGE", e.target.value)} />
      <input placeholder="Signature — ex. « Christophe Bazaille, Innovat Property Suisse » (vide : aucune)"
        value={v.SIGNATURE || ""} onChange={e => champ("SIGNATURE", e.target.value)} />
      <textarea rows={4} value={v.CONTEXTE || ""}
        placeholder="Ce que l'IA doit savoir de la maison : activité, ce qu'on propose, ce qu'on ne promet jamais. C'est ce qui sépare une réponse juste d'une réponse plausible."
        onChange={e => champ("CONTEXTE", e.target.value)} style={{ fontSize: 12 }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn bleu" onClick={async () => {
          const r = await fetch(`/capgrowth/api/reglages-ia?client=${client}`, { method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ton: v.TON, longueur: v.LONGUEUR, appel: v.APPEL,
              conge: v.CONGE, signature: v.SIGNATURE, langue: v.LANGUE, contexte: v.CONTEXTE }) });
          const j = await r.json();
          if (!r.ok) { surMessage(j.erreur); return; }
          surChange(j.reglages); surMessage("Options enregistrées pour ce mandat.");
        }}>Enregistrer</button>
        <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
          Ces options valent pour tout le mandat, pas seulement pour vous.
        </span>
      </div>
    </div>);
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
