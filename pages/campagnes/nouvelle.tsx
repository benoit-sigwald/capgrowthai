import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

/*
 * Creation d'une campagne : segment -> gabarits (montres, choisis par langue
 * automatiquement) -> expediteur (verifie, impose en mode utilisateur) ->
 * preparation. L'envoi se fait ensuite par lots depuis la liste, sous le
 * plafond de chauffage du domaine.
 */
function Nouvelle() {
  const { mandat } = useMandat();
  const routeur = useRouter();
  const [segments, setSegments] = useState<{ ID: number; NOM: string }[]>([]);
  const [expediteurs, setExpediteurs] = useState<Record<string, never>[]>([]);
  const [gabarits, setGabarits] = useState<Record<string, string>[]>([]);
  const [nom, setNom] = useState("");
  const [segmentId, setSegmentId] = useState(0);
  const [expediteurId, setExpediteurId] = useState(0);
  const [limite, setLimite] = useState(200);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/segments?client=${mandat.ID}`).then(r => r.json())
      .then(d => setSegments(d.rows || []));
    fetch(`/capgrowth/api/expediteurs?client=${mandat.ID}`).then(r => r.json())
      .then(d => setExpediteurs(d.rows || []));
    fetch(`/capgrowth/api/gabarits`).then(r => r.json()).then(d => setGabarits(d.rows || []));
  }, [mandat]);

  async function creer() {
    if (!mandat) return;
    setMsg("Préparation…");
    const r = await fetch(`/capgrowth/api/campagnes?client=${mandat.ID}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom, segment_id: segmentId, expediteur_id: expediteurId, limite }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    setMsg(`Campagne préparée : ${j.prepares} envoi(s) en attente` +
      (j.hors_investisseurs ? ` — ${j.hors_investisseurs} contact(s) hors base investisseurs écartés` : "") + ".");
    setTimeout(() => routeur.push("/campagnes"), 1400);
  }

  return (
    <div style={{ maxWidth: 560, display: "grid", gap: 14 }}>
      <label>Nom de la campagne
        <input style={{ width: "100%", marginTop: 4 }} value={nom}
          onChange={e => setNom(e.target.value)} placeholder="Levée Super Cannes — vague 1" /></label>
      <label>Segment (rejoué à la préparation)
        <select style={{ width: "100%", marginTop: 4 }} value={segmentId}
          onChange={e => setSegmentId(Number(e.target.value))}>
          <option value={0}>—</option>
          {segments.map(s => <option key={s.ID} value={s.ID}>{s.NOM}</option>)}
        </select></label>
      {/* Une liste vide doit dire pourquoi et ou aller : un « — » muet laisse
          croire a une panne alors que c'est le cloisonnement qui fonctionne. */}
      {!segments.length && (
        <span className="pill warn">
          Aucun segment sur le mandat « {mandat?.NOM} ». Créez-en un dans
          Contacts → Segments, ou changez de mandat en haut à gauche.</span>)}

      <label>Expéditeur
        <select style={{ width: "100%", marginTop: 4 }} value={expediteurId}
          onChange={e => setExpediteurId(Number(e.target.value))}>
          <option value={0}>—</option>
          {expediteurs.map(x => (
            <option key={x["ID"]} value={x["ID"]}
              disabled={!x["SPF_OK"] || !x["DKIM_OK"]}>
              {x["EMAIL"]}{(!x["SPF_OK"] || !x["DKIM_OK"]) ? " — domaine non authentifié" : ""}
            </option>))}
        </select></label>
      {!expediteurs.length && (
        <span className="pill warn">
          Aucun expéditeur sur le mandat « {mandat?.NOM} ». Ajoutez-en un dans
          Paramètres → Expéditeurs ; son domaine devra être authentifié avant d&apos;envoyer.</span>)}
      {expediteurs.length > 0 && !expediteurs.some(x => x["SPF_OK"] && x["DKIM_OK"]) && (
        <span className="pill crit">
          Aucun expéditeur authentifié : SPF et DKIM manquent. Paramètres → Expéditeurs
          affiche les lignes DNS exactes à coller.</span>)}
      <label>Limite de cibles
        <input type="number" style={{ width: 120, marginTop: 4, display: "block" }}
          value={limite} onChange={e => setLimite(Number(e.target.value))} /></label>
      <div>
        <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 6 }}>
          Gabarits actifs — choisis automatiquement selon la langue du contact</div>
        {gabarits.map(g => <div key={g.TEMPLATE_ID} style={{ padding: "5px 0",
          borderBottom: "1px solid var(--hair-soft)", fontSize: 11 }}>
          <span className="pill">{g.LANGUAGE}</span> {g.SUBJECT} <i style={{ color: "var(--ink-3)" }}>v{g.VERSION}</i>
        </div>)}
      </div>
      <button className="btn bleu" disabled={!nom || !segmentId || !expediteurId}
        onClick={creer}>Préparer la campagne</button>
      {msg && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{msg}</span>}
    </div>
  );
}

export default function PageNouvelle() {
  return (
    <MandatFournisseur>
      <Coquille section="campagnes">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Nouvelle campagne</h1>
        <Nouvelle />
      </Coquille>
    </MandatFournisseur>
  );
}
