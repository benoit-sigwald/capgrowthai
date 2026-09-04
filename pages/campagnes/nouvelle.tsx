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
  const [listes, setListes] = useState<{ ID: number; NOM: string; MEMBRES: number }[]>([]);
  // Deux facons de designer qui part, jamais melangees : un critere rejoue, ou
  // un ensemble fige. Melanger les deux dans un seul menu ferait croire qu'ils
  // se comportent pareil.
  const [source, setSource] = useState<"segment" | "liste">("segment");
  const [expediteurs, setExpediteurs] = useState<Record<string, never>[]>([]);
  const [gabarits, setGabarits] = useState<Record<string, string>[]>([]);
  const [nom, setNom] = useState("");
  const [segmentId, setSegmentId] = useState(0);
  const [listeId, setListeId] = useState(0);
  const [expediteurId, setExpediteurId] = useState(0);
  /*
   * Target limit. Empty means the whole segment or list — its own size is the
   * answer. It used to be a number whose 0 silently meant 500, which is how a
   * segment of 1 084 addresses announced "500 contacts partiraient".
   */
  const [limite, setLimite] = useState("");
  /*
   * Pacing. Manual by default — null cadence means the batch leaves when
   * someone clicks, which is how every campaign has worked so far. Choosing a
   * rhythm is a deliberate act, never a side effect of opening this page.
   */
  const [cadence, setCadence] = useState<number | null>(null);
  const [fenetre, setFenetre] = useState("ouvrees");
  const [fenetres, setFenetres] = useState<
    { id: string; libelle: string; de: number; a: number; ouverte: boolean }[]>([]);
  // Un gabarit retenu par langue. Le moteur choisit la langue du contact ; a
  // nous de dire QUEL gabarit represente cette langue pour cette campagne.
  const [choix, setChoix] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const langues = [...new Set(gabarits.map(g => String(g.LANGUAGE)))].sort();
  // Combien partiraient, si on preparait maintenant. Lu avant, pas apres.
  const [apercu, setApercu] = useState<
    { cibles: number; total: number; nouveaux: number; plafond_atteint: boolean } | null>(null);

  // Les fenetres viennent du moteur : les recopier ici ferait deux listes qui
  // divergent, et l'ecran proposerait une fenetre que le tour ne sait pas lire.
  useEffect(() => {
    fetch("/capgrowth/api/fenetres").then(r => r.json())
      .then(d => setFenetres(d.fenetres || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/segments?client=${mandat.ID}`).then(r => r.json())
      .then(d => setSegments(d.rows || []));
    fetch(`/capgrowth/api/expediteurs?client=${mandat.ID}`).then(r => r.json())
      .then(d => setExpediteurs(d.rows || []));
    fetch(`/capgrowth/api/listes?client=${mandat.ID}`).then(r => r.json())
      .then(d => setListes(d.rows || []));
    fetch(`/capgrowth/api/gabarits`).then(r => r.json()).then(d => {
      const rows = d.rows || [];
      setGabarits(rows);
      // Par defaut, le plus recemment mis a jour de chaque langue — mais le
      // defaut est AFFICHE, jamais subi.
      const parLangue: Record<string, string> = {};
      for (const g of rows) if (!parLangue[g.LANGUAGE]) parLangue[g.LANGUAGE] = g.TEMPLATE_ID;
      setChoix(parLangue);
    });
  }, [mandat]);

  useEffect(() => {
    const id = source === "segment" ? segmentId : listeId;
    if (!mandat || !id) { setApercu(null); return; }
    setApercu(null);
    const cle = source === "segment" ? "segment_id" : "liste_id";
    fetch(`/capgrowth/api/apercu?client=${mandat.ID}&${cle}=${id}&limite=${limite || 0}`)
      .then(r => r.json()).then(d => setApercu(d.cibles === undefined ? null : d));
  }, [mandat, source, segmentId, listeId, limite]);

  async function creer() {
    if (!mandat) return;
    setMsg("Préparation…");
    const r = await fetch(`/capgrowth/api/campagnes?client=${mandat.ID}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom, expediteur_id: expediteurId,
        limite: Number(limite) || undefined,
        cadence_min: cadence, fenetre,
        template_ids: Object.values(choix).filter(Boolean),
        ...(source === "segment" ? { segment_id: segmentId } : { liste_id: listeId }) }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    /*
     * Say what was skipped, not only what was prepared.
     *
     * The mailer now drops a recipient who already received this exact
     * template. Left unsaid, the batch simply comes out smaller than the
     * segment promised, and the sender goes hunting for a bug that isn't one.
     */
    const ecartes = j.ignores?.deja_ce_gabarit
      ? ` — ${j.ignores.deja_ce_gabarit} écarté(s) : ils ont déjà reçu ce gabarit` : "";
    setMsg(`Campagne préparée : ${j.prepares} envoi(s) en attente` + ecartes +
      (j.contacts_crees ? ` — ${j.contacts_crees} nouveau(x) destinataire(s) ajouté(s) à la base de prospection` : "") + ".");
    setTimeout(() => routeur.push("/campagnes"), 1400);
  }

  return (
    <div style={{ maxWidth: 560, display: "grid", gap: 14 }}>
      <label>Nom de la campagne
        <input style={{ width: "100%", marginTop: 4 }} value={nom}
          onChange={e => setNom(e.target.value)} placeholder="Levée Super Cannes — vague 1" /></label>
      <div>
        <div style={{ display: "flex", gap: 14, marginBottom: 6 }}>
          {(["segment", "liste"] as const).map(t => (
            <label key={t} style={{ fontSize: 12, display: "flex", gap: 5, alignItems: "center" }}>
              <input type="radio" name="source" checked={source === t}
                onChange={() => setSource(t)} />
              {t === "segment" ? "Segment — critère rejoué" : "Liste — ensemble figé"}
            </label>))}
        </div>

        {source === "segment" ? (<>
          <select style={{ width: "100%" }} value={segmentId}
            onChange={e => setSegmentId(Number(e.target.value))}>
            <option value={0}>—</option>
            {segments.map(s => <option key={s.ID} value={s.ID}>{s.NOM}</option>)}
          </select>
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "6px 0 0" }}>
            Le critère est rejoué au moment de la préparation : la campagne part sur
            l&apos;état du jour, pas sur une photo prise le jour où le segment a été créé.</p>
          {/* Une liste vide doit dire pourquoi et ou aller : un « — » muet laisse
              croire a une panne alors que c'est le cloisonnement qui fonctionne. */}
          {!segments.length && (
            <span className="pill warn">
              Aucun segment sur le mandat « {mandat?.NOM} ». Créez-en un dans
              Contacts → Segments, ou changez de mandat en haut à gauche.</span>)}
        </>) : (<>
          <select style={{ width: "100%" }} value={listeId}
            onChange={e => setListeId(Number(e.target.value))}>
            <option value={0}>—</option>
            {listes.map(l => <option key={l.ID} value={l.ID}>{l.NOM} — {l.MEMBRES} contact(s)</option>)}
          </select>
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "6px 0 0" }}>
            La liste part telle quelle : ce qui y est le reste, même si le référentiel
            change. À choisir quand la sélection a été pesée à la main.</p>
          {!listes.length && (
            <span className="pill warn">
              Aucune liste sur le mandat « {mandat?.NOM} ». Créez-en une dans
              Contacts → Listes, ou depuis une sélection dans « Tous les contacts ».</span>)}
        </>)}
      </div>

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
        <input type="number" min={1} placeholder="toutes" style={{ width: 120, marginTop: 4, display: "block" }}
          value={limite} onChange={e => setLimite(e.target.value)} />
        <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
          Vide = tout le segment ou la liste.</span></label>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 10, color: "var(--ink-3)" }}>
          Rythme d’envoi — le volume du jour reste plafonné par le chauffage du domaine
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={cadence ?? ""} style={{ minWidth: 190 }}
            onChange={e => setCadence(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Manuel — j’envoie les lots moi-même</option>
            <option value="5">Un message toutes les 5 minutes</option>
            <option value="15">Un message toutes les 15 minutes</option>
            <option value="30">Un message toutes les 30 minutes</option>
            <option value="60">Un message par heure</option>
          </select>
          <select value={fenetre} disabled={cadence === null} style={{ minWidth: 220 }}
            onChange={e => setFenetre(e.target.value)}>
            {fenetres.map(f => (
              <option key={f.id} value={f.id}>
                {f.libelle}{f.de !== 0 || f.a !== 24 ? ` — ${f.de}h à ${f.a}h` : ""}
              </option>))}
          </select>
          {cadence !== null && fenetres.find(f => f.id === fenetre)?.ouverte === false && (
            <span className="pill">fenêtre fermée : l’envoi démarrera à sa prochaine ouverture</span>)}
        </div>
        <div style={{ fontSize: 10, color: "var(--ink-3)" }}>
          {cadence === null
            ? "Rien ne part tant que personne ne clique."
            : "Heures et jours fériés à l’heure de l’expéditeur (Europe/Paris)."}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 6 }}>
          Gabarit retenu par langue — le moteur applique celui de la langue du contact
        </div>
        {langues.map(lg => {
          const candidats = gabarits.filter(g => g.LANGUAGE === lg);
          return (
            <div key={lg} style={{ display: "flex", gap: 8, alignItems: "center",
              padding: "5px 0", borderBottom: "1px solid var(--hair-soft)" }}>
              <span className="pill">{lg}</span>
              <select style={{ flex: 1 }} value={choix[lg] || ""}
                onChange={e => setChoix({ ...choix, [lg]: e.target.value })}>
                <option value="">— ne pas écrire dans cette langue</option>
                {candidats.map(g => <option key={g.TEMPLATE_ID} value={g.TEMPLATE_ID}>
                  {g.SUBJECT} (v{g.VERSION})</option>)}
              </select>
              {candidats.length > 1 && <span className="pill warn">{candidats.length} au choix</span>}
            </div>);
        })}
        {!gabarits.length && <span className="pill crit">
          Aucun gabarit actif : la campagne ne pourrait rien envoyer.</span>}
        <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 6 }}>
          Un contact dont la langue n&apos;a pas de gabarit retenu n&apos;est pas préparé —
          il est compté et dit, pas envoyé au hasard dans une autre langue.
        </div>
      </div>

      {apercu && (
        <span className={apercu.cibles ? "pill" : "pill crit"}>
          {apercu.cibles} contact(s) partiraient
          {apercu.plafond_atteint &&
            ` sur ${apercu.total.toLocaleString("fr-FR")} — limite de cibles`}
          {apercu.nouveaux > 0 &&
            ` — dont ${apercu.nouveaux} nouveau(x) destinataire(s), inconnus de la base de prospection jusqu'ici`}
          {apercu.cibles === 0 && " : cette source ne contient aucun contact joignable"}
        </span>)}
      <button className="btn bleu"
        disabled={!nom || !expediteurId || !(source === "segment" ? segmentId : listeId)}
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
