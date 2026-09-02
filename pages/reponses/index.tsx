import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

type Reponse = Record<string, string | number | null>;

const quand = (v: string | number | null) =>
  v ? new Date(String(v)).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";
const jour = (v: string | number | null) =>
  v ? new Date(String(v)).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "";

/*
 * La signature, composee cote ecran comme cote serveur : ce qui est rempli,
 * dans cet ordre, et rien d'autre. Une ligne vide ne doit jamais devenir une
 * ligne vide dans un e-mail.
 */
function signatureDe(r: Reponse) {
  const nom = [r.PRENOM, r.NOM].filter(Boolean).join(" ").trim()
    || String(r.NOM_AFFICHAGE ?? "");
  return [nom, r.FONCTION, r.SOCIETE, r.ADRESSE, r.EXPEDITEUR_EMAIL, r.TELEPHONE, r.SITE]
    .map(l => String(l ?? "").trim()).filter(Boolean).join("\n");
}

/* Ce qui manque pour signer : on le dit, on ne signe pas a moitie en silence. */
function manquePourSigner(r: Reponse) {
  return ([["SOCIETE", "société"], ["ADRESSE", "adresse"], ["TELEPHONE", "téléphone"]] as const)
    .filter(([c]) => !String(r[c] ?? "").trim()).map(([, l]) => l);
}

/*
 * Lire une reponse HTTP sans se faire avoir par ce qui n'est pas du JSON.
 *
 * Panne du 2026-09-02 : un envoi tombe pendant un redeploiement recevait une
 * page d'erreur du proxy, `r.json()` levait, et l'ecran n'affichait RIEN — ni
 * succes ni echec. L'utilisateur a cru a un envoi parti puis perdu, alors que
 * rien n'etait sorti. Un echec doit se voir.
 */
async function lire(r: Response) {
  const texte = await r.text();
  try { return { ok: r.ok, data: JSON.parse(texte) as Record<string, string> }; }
  catch {
    return { ok: false, data: { erreur: r.ok
      ? "réponse illisible du serveur — rien n'a été envoyé, réessayez"
      : `service indisponible (${r.status}) — rien n'a été envoyé, réessayez` } };
  }
}

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
  // Toutes les reponses envoyees, dans l'ordre : un echange en compte parfois
  // plusieurs, et n'en montrer qu'une fait croire que les autres sont perdues.
  const [envoyees, setEnvoyees] = useState<Reponse[]>([]);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");
  const [consigne, setConsigne] = useState("");
  const [ia, setIa] = useState(false);
  // « auto » suit le message recu ; on peut imposer, message par message.
  const [langue, setLangue] = useState("auto");
  const [msg, setMsg] = useState("");
  // Par defaut, ce qui attend une reponse : une liste ou le traite et le
  // non-traite se melangent ne dit plus ce qu'il reste a faire.
  const [filtre, setFiltre] = useState<"a_traiter" | "toutes">("a_traiter");
  const [options, setOptions] = useState(false);
  const [reglages, setReglages] = useState<Record<string, string>>({});
  const [propositions, setPropositions] = useState<string[] | null>(null);
  const [pieces, setPieces] = useState<{ nom: string; contenu: string; poids: number }[]>([]);

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/reponses?client=${mandat.ID}`).then(r => r.json())
      .then(d => { setRows(d.rows || []); setEnvoyees(d.envoyees || []); });
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
    const { ok, data: j } = await lire(r);
    setMsg(ok ? j.resume : j.erreur);
    charger();
  }

  async function proposer(r: Reponse) {
    setIa(true); setMsg("L'IA rédige une proposition…");
    const rep = await fetch(`/capgrowth/api/redaction`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "reponse", client: mandat?.ID,
        recu: String(r.REPLY_SNIPPET ?? ""),
        destinataire: [r.FIRST_NAME, r.LAST_NAME].filter(Boolean).join(" ") || String(r.EMAIL),
        signature: signatureDe(r),
        envoye: String(r.MESSAGE_ENVOYE ?? ""),
        langueEnvoi: String(r.LANGUE_ENVOI ?? ""),
        langue,
        /*
         * Pas le nom INTERNE de la campagne : « 02.09 test nouvelle fiche » est
         * une etiquette de travail, et le modele la reprenait telle quelle dans
         * un message adresse au client. Seul l'objet de l'e-mail auquel la
         * personne repond a un sens pour elle.
         */
        contexte: `Objet de l'échange : « ${r.RENDERED_SUBJECT} ».`
          + (r.COMPANY ? ` Le contact travaille chez ${r.COMPANY}.` : ""),
        consigne }) });
    const { ok, data: j } = await lire(rep);
    setIa(false);
    if (!ok) { setMsg(j.erreur); return; }
    // Trois propositions : on choisit mieux en comparant qu'en corrigeant.
    const liste = (j as unknown as { propositions?: string[] }).propositions;
    setPropositions(liste?.length ? liste : [String(j.html ?? "")]);
    setMsg("");
  }

  async function envoyer(r: Reponse) {
    if (!brouillon.trim()) return;
    if (!confirm(`Envoyer cette réponse à ${r.EMAIL} ?`)) return;
    setMsg("Envoi…");
    let rep: Response;
    try {
      rep = await fetch(`/capgrowth/api/reponses?client=${mandat?.ID}`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ send_id: r.SEND_ID, corps: brouillon,
        // La signature attendue : le routeur la reconnait en fin de texte pour
        // la mettre en pied de page. Modifiee a la main, elle se rend comme le
        // reste — jamais faux, seulement moins joli.
        signature: signatureDe(r),
        pieces: pieces.map(({ nom, contenu }) => ({ nom, contenu })) }) });
    } catch {
      setMsg("Envoi impossible : le serveur n'a pas répondu. Rien n'est parti, réessayez.");
      return;
    }
    const { ok, data: j } = await lire(rep);
    if (!ok) { setMsg(j.erreur); return; }
    setMsg(`Envoyé à ${j.destinataire} depuis ${j.expediteur}`
      + (j.pieces ? `, ${j.pieces} pièce(s) jointe(s).` : "."));
    /*
     * On bascule sur « Toutes ».
     *
     * Le filtre par defaut masque ce qui est traite : la reponse qu'on vient
     * d'envoyer disparaissait donc de la liste a la seconde ou elle partait, ce
     * qui se lit comme un envoi perdu. Elle reste desormais sous les yeux, avec
     * son texte.
     */
    setFiltre("toutes");
    setBrouillon(""); setConsigne(""); setPieces([]); charger();
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

    {propositions && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.25)", zIndex: 60,
        display: "grid", placeItems: "center" }} onClick={() => setPropositions(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: "var(--card)",
          borderRadius: "var(--r)", padding: 20, width: "min(980px, 94vw)",
          maxHeight: "88vh", overflowY: "auto", display: "grid", gap: 12 }}>
          <b style={{ fontSize: 13 }}>Trois propositions — choisissez celle à reprendre</b>
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
            Elles répondent au même message, avec un angle différent. Rien n&apos;est envoyé :
            la proposition retenue vient dans la zone de saisie, où vous la corrigez.
          </span>
          {propositions.map((t, i) => (
            <div key={i} style={{ border: "1px solid var(--hair)", borderRadius: 10,
              padding: 12, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 10, color: "var(--ink-3)" }}>
                {["Au plus court", "Développée", "Plus chaleureuse"][i] || `Proposition ${i + 1}`}
              </div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.5 }}>{t}</div>
              <div>
                <button className="btn bleu" onClick={() => {
                  setBrouillon(t); setPropositions(null);
                  setMsg("Proposition reprise — relisez et corrigez, rien n'est parti.");
                }}>Reprendre celle-ci</button>
              </div>
            </div>))}
          <div><button className="btn" onClick={() => setPropositions(null)}>Fermer</button></div>
        </div>
      </div>)}

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
                    whiteSpace: "nowrap" }}>
                    {r.REPONDU_LE ? "↩ " : ""}{jour(r.REPLIED_AT)}</span>
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

          {courant.MESSAGE_ENVOYE && (
            <details style={{ margin: "0 0 14px", padding: "10px 12px",
              background: "var(--bg-alt)", borderRadius: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--ink-3)" }}>
                Message envoyé le {quand(courant.SENT_AT)} — {String(courant.CAMPAGNE)}
              </summary>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap",
                marginTop: 8, color: "var(--ink-2)" }}>
                {String(courant.MESSAGE_ENVOYE)}</div>
            </details>)}

          <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap",
            padding: "4px 0 14px" }}>
            {String(courant.REPLY_SNIPPET ?? "(message vide)")}
          </div>

          {envoyees.filter(e => String(e.SEND_ID) === String(courant.SEND_ID)).map((e, i) => (
            <div key={i} style={{ borderTop: "1px solid var(--hair-soft)", paddingTop: 12,
              marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 6 }}>
                Votre réponse, le {quand(e.QUAND)}</div>
              <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap",
                color: "var(--ink-2)" }}>{String(e.RESUME ?? "")}</div>
            </div>))}

          <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--hair-soft)",
            paddingTop: 12 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input style={{ flex: 1, minWidth: 200 }} value={consigne}
                placeholder="Optionnel : « propose un appel jeudi », « décline poliment »…"
                onChange={e => setConsigne(e.target.value)} />
              <select value={langue} onChange={e => setLangue(e.target.value)}
                title="Langue de la réponse">
                <option value="auto">langue auto</option>
                <option value="fr">français</option>
                <option value="en">anglais</option>
              </select>
              <button className="btn" disabled={ia} onClick={() => proposer(courant)}>
                {ia ? "…" : "Proposer une réponse (IA)"}</button>
            </div>
            {manquePourSigner(courant).length > 0 && (
              <span className="pill warn">
                Signature incomplète : {manquePourSigner(courant).join(", ")} manque(nt) sur
                l&apos;expéditeur. Paramètres → Expéditeurs pour les renseigner.
              </span>)}
            <textarea rows={8} value={brouillon} placeholder="Votre réponse…"
              onChange={e => setBrouillon(e.target.value)}
              style={{ width: "100%", fontSize: 13 }} />
            {pieces.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {pieces.map((p, i) => (
                  <span key={i} className="pill">
                    {p.nom} · {Math.round(p.poids / 1024)} Ko{" "}
                    <a style={{ cursor: "pointer", color: "var(--crit)" }}
                      onClick={() => setPieces(l => l.filter((_, j) => j !== i))}>retirer</a>
                  </span>))}
              </div>)}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label className="btn" style={{ cursor: "pointer" }}>
                Joindre un document
                <input type="file" multiple style={{ display: "none" }}
                  onChange={async e => {
                    const fichiers = [...(e.target.files || [])];
                    e.target.value = "";
                    for (const f of fichiers) {
                      // 9,5 Mo au total : c'est le plafond du routeur, verifie
                      // ici pour ne pas lire 40 Mo avant de se faire refuser.
                      const deja = pieces.reduce((n, p) => n + p.poids, 0);
                      if (deja + f.size > 9_500_000) {
                        setMsg(`« ${f.name} » dépasse le total de 9,5 Mo autorisé.`);
                        continue;
                      }
                      const b64 = await new Promise<string>(res => {
                        const l = new FileReader();
                        l.onload = () => res(String(l.result).split(",")[1] || "");
                        l.readAsDataURL(f);
                      });
                      setPieces(p => [...p, { nom: f.name, contenu: b64, poids: f.size }]);
                    }
                  }} />
              </label>
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
      <input placeholder="Formule d'appel imposée — ex. « Madame, Monsieur, » (vide : « Bonjour Prénom, »)"
        value={v.APPEL || ""} onChange={e => champ("APPEL", e.target.value)} />
      <span style={{ fontSize: 10, color: "var(--ink-3)", marginTop: -6 }}>
        Ce champ est collé <b>mot pour mot</b> en tête du message : écrivez une formule,
        pas une consigne. Laissé vide, l&apos;appel reprend le prénom du contact.
        Pour donner une instruction à l&apos;IA, utilisez le champ ci-dessous ou la
        consigne à côté du bouton.
      </span>
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
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>E-mails</h1>
        <p style={{ color: "var(--ink-3)", marginBottom: 14 }}>
          Une ouverture se compte, une réponse s&apos;honore. Ce qui part d&apos;ici s&apos;envoie
          sous l&apos;adresse de la campagne — celle à laquelle la personne a écrit — et laisse
          une trace dans le CRM. L&apos;IA propose ; vous relisez et vous envoyez.</p>
        <Reponses />
      </Coquille>
    </MandatFournisseur>
  );
}
