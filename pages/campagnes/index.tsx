import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

const taux = (n: number, d: number) => d ? `${n} (${Math.round(100 * n / d)} %)` : "—";
// Short labels for the table cell. The mailer owns the real definitions; these
// only have to fit in a column.
const LIBELLES: Record<string, string> = {
  ouvrees: "heures ouvrées", soir: "soirées",
  weekend: "week-end et fériés", continu: "sans restriction",
};
type Ligne = Record<string, string | number | null>;

/*
 * Panneau d'une campagne existante : renommer, completer, annuler ce qui n'est
 * pas parti, supprimer.
 *
 * Il s'ouvre sous la ligne plutot que dans une page separee : ce qu'on decide
 * ici depend des chiffres de la ligne — combien sont partis, combien attendent.
 */
function Panneau({ c, surFermer, surChange }: {
  c: Ligne; surFermer: () => void; surChange: () => void;
}) {
  const { mandat } = useMandat();
  const id = String(c.CAMPAIGN_ID);
  const [nom, setNom] = useState(String(c.NAME ?? ""));
  const [segments, setSegments] = useState<{ ID: number; NOM: string }[]>([]);
  const [listes, setListes] = useState<{ ID: number; NOM: string; MEMBRES: number }[]>([]);
  const [cible, setCible] = useState("");   // « s:12 » ou « l:3 »
  const [limite, setLimite] = useState(200);
  const [gabarits, setGabarits] = useState<Record<string, string>[]>([]);
  const [choix, setChoix] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const envoyes = Number(c.ENVOYES) || 0;
  const attente = Number(c.EN_ATTENTE) || 0;

  useEffect(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/segments?client=${mandat.ID}`).then(r => r.json())
      .then(d => setSegments(d.rows || []));
    fetch(`/capgrowth/api/listes?client=${mandat.ID}`).then(r => r.json())
      .then(d => setListes(d.rows || []));
    fetch(`/capgrowth/api/gabarits`).then(r => r.json()).then(d => {
      const rows = d.rows || [];
      setGabarits(rows);
      const parLangue: Record<string, string> = {};
      for (const g of rows) if (!parLangue[g.LANGUAGE]) parLangue[g.LANGUAGE] = g.TEMPLATE_ID;
      setChoix(parLangue);
    });
  }, [mandat]);

  async function agir(methode: string, corps: unknown, encours: string) {
    setMsg(encours);
    const r = await fetch(`/capgrowth/api/campagnes/${encodeURIComponent(id)}`,
      { method: methode, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return null; }
    surChange(); return j;
  }

  return (
    <tr><td colSpan={12} style={{ background: "var(--bg-alt)", padding: "14px 16px" }}>
      <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={nom} onChange={e => setNom(e.target.value)} style={{ width: 260 }} />
          <button className="btn" disabled={!nom.trim() || nom === c.NAME}
            onClick={async () => { if (await agir("PATCH", { nom }, "Renommage…")) setMsg("Renommée."); }}>
            Renommer</button>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={surFermer}>Fermer</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 108 }}>Ajouter des cibles</span>
          <select value={cible} onChange={e => setCible(e.target.value)}>
            <option value="">Segment ou liste…</option>
            {segments.length > 0 && <optgroup label="Segments — critère rejoué">
              {segments.map(s => <option key={`s${s.ID}`} value={`s:${s.ID}`}>{s.NOM}</option>)}
            </optgroup>}
            {listes.length > 0 && <optgroup label="Listes — ensemble figé">
              {listes.map(l => <option key={`l${l.ID}`} value={`l:${l.ID}`}>
                {l.NOM} — {l.MEMBRES} contact(s)</option>)}
            </optgroup>}
          </select>
          <input type="number" value={limite} style={{ width: 90 }}
            onChange={e => setLimite(Number(e.target.value))} />
          <button className="btn bleu" disabled={!cible} onClick={async () => {
            const [type, id] = cible.split(":");
            const j = await agir("POST", { limite,
              template_ids: Object.values(choix).filter(Boolean),
              ...(type === "s" ? { segment_id: Number(id) } : { liste_id: Number(id) }) },
              "Préparation…");
            if (j) setMsg(`${j.prepares} envoi(s) ajouté(s)`
              + (j.ignores?.deja_cible ? ` — ${j.ignores.deja_cible} déjà ciblé(s) par cette campagne` : "")
              + (j.ignores?.deja_ce_gabarit ? ` — ${j.ignores.deja_ce_gabarit} ont déjà reçu ce gabarit` : "")
              + (j.contacts_crees ? `, ${j.contacts_crees} nouveau(x) destinataire(s)` : "") + ".");
          }}>Ajouter</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 108 }}>Gabarit par langue</span>
          {[...new Set(gabarits.map(g => String(g.LANGUAGE)))].sort().map(lg => (
            <select key={lg} value={choix[lg] || ""}
              onChange={e => setChoix({ ...choix, [lg]: e.target.value })}>
              <option value="">{lg} — aucun</option>
              {gabarits.filter(g => g.LANGUAGE === lg).map(g =>
                <option key={g.TEMPLATE_ID} value={g.TEMPLATE_ID}>
                  {lg} · {String(g.SUBJECT).slice(0, 40)} (v{g.VERSION})</option>)}
            </select>))}
        </div>
        <p style={{ fontSize: 11, color: "var(--ink-3)", margin: 0 }}>
          L&apos;ajout garde l&apos;expéditeur de la campagne ({String(c.EXPEDITEUR_EMAIL || "—")}) :
          une même campagne ne part pas sous deux adresses. Les contacts déjà ciblés sont ignorés.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {attente > 0 && (
            <button className="btn" onClick={async () => {
              if (!confirm(`Annuler les ${attente} envoi(s) en attente ? Les ${envoyes} déjà partis ne bougent pas.`)) return;
              const j = await agir("DELETE", { annuler_en_attente: true }, "Annulation…");
              if (j) setMsg(`${j.annules} envoi(s) annulé(s).`);
            }}>Annuler les {attente} en attente</button>)}
          <button className="btn" style={{ color: "var(--crit)" }} onClick={async () => {
            if (!confirm(`Supprimer la campagne « ${c.NAME} » ?`)) return;
            const j = await agir("DELETE", {}, "Suppression…");
            if (j) { setMsg("Campagne supprimée."); surFermer(); }
          }}>Supprimer la campagne</button>
          {envoyes > 0 && (
            <button className="btn" style={{ color: "var(--crit)" }} onClick={async () => {
              if (!confirm(`Supprimer « ${c.NAME} » AVEC ses ${envoyes} envoi(s) déjà partis ?

`
                + `Les taux, ouvertures et réponses de cette campagne disparaissent définitivement. `
                + `À réserver aux campagnes de test.`)) return;
              const j = await agir("DELETE", { forcer: true }, "Suppression…");
              if (j) { setMsg("Campagne et historique supprimés."); surFermer(); }
            }}>Supprimer avec l&apos;historique</button>)}
          {envoyes > 0 && <span className="pill warn" style={{ alignSelf: "center" }}>
            {envoyes} e-mail(s) partis : la suppression simple est refusée, il faut la demander avec l&apos;historique.
          </span>}
        </div>
        {msg && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{msg}</span>}
      </div>
    </td></tr>);
}

/*
 * How many to send, asked rather than assumed.
 *
 * The button used to post a fixed batch of 20. On 2026-09-04 that fired twenty
 * messages in one second on a campaign explicitly set to one every five
 * minutes — the pacing guarded the scheduler and left this door wide open.
 *
 * So the quantity is now a question, with the two numbers that bound the
 * answer shown next to it: what is still pending, and what the domain's
 * warm-up allows today. Neither is guessable from the row.
 */
function BoiteEnvoi({ c, surFermer, surEnvoye }: {
  c: Ligne; surFermer: () => void;
  surEnvoye: (message: string) => void;
}) {
  const enAttente = Number(c.EN_ATTENTE) || 0;
  const cadence = Number(c.CADENCE_MIN) || 0;
  // A paced campaign proposes ONE. Sending a batch by hand is still allowed —
  // a correction, a test, an urgent wave — but it is a deliberate act now,
  // not the default that silently undoes the rhythm.
  const [combien, setCombien] = useState(String(cadence ? 1 : Math.min(20, enAttente)));
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function valider() {
    const n = Number(combien);
    if (!Number.isInteger(n) || n < 1)
      return setErreur("Indiquez un nombre de messages, au moins 1.");
    if (n > enAttente)
      return setErreur(`Cette campagne n'a que ${enAttente} envoi(s) en attente.`);
    setErreur(""); setEnvoi(true);
    const r = await fetch(
      `/capgrowth/api/campagnes/${encodeURIComponent(String(c.CAMPAIGN_ID))}/envoyer`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lot: n }) });
    const j = await r.json().catch(() => ({}));
    setEnvoi(false);
    if (!r.ok) { setErreur(j.erreur || "Envoi refusé."); return; }
    surEnvoye(`${j.envoyes} envoyé(s) — plafond du jour ${j.plafond} `
      + `(jour d'envoi n°${(j.journees_d_envoi ?? 0) + 1}), reste ${j.restant_aujourdhui}.`);
    surFermer();
  }

  return (
    <div style={{ position: "absolute", zIndex: 30, right: 0, top: "100%", marginTop: 4,
      background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 12,
      boxShadow: "var(--shadow)", padding: 14, width: 290, textAlign: "left" }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Combien envoyer ?</div>
      {cadence > 0 && (
        <div className="pill" style={{ marginBottom: 8, display: "block" }}>
          Campagne cadencée : 1 message toutes les {cadence} min. Un envoi manuel
          s’ajoute et décale le prochain tour.
        </div>)}
      <input type="number" min={1} max={enAttente} autoFocus
        style={{ width: "100%", marginBottom: 6 }}
        value={combien} onChange={e => { setCombien(e.target.value); setErreur(""); }}
        onKeyDown={e => { if (e.key === "Enter") valider(); }} />
      <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 8 }}>
        {enAttente} en attente. Le plafond du jour du domaine s’applique en plus :
        le moteur enverra moins si la journée est déjà pleine.
      </div>
      {erreur && <div style={{ fontSize: 11, color: "var(--danger, #b00)", marginBottom: 8 }}>
        {erreur}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn bleu" disabled={envoi} onClick={valider}>
          {envoi ? "Envoi…" : "Envoyer"}</button>
        <button className="btn" disabled={envoi} onClick={surFermer}>Annuler</button>
      </div>
    </div>);
}

function Campagnes() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Ligne[]>([]);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [rafraichit, setRafraichit] = useState(false);
  const [boite, setBoite] = useState<string | null>(null);

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/campagnes?client=${mandat.ID}`).then(r => r.json())
      .then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);


  return (<>
    <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
      <Link href="/campagnes/nouvelle" className="btn bleu"
        style={{ display: "inline-block" }}>Nouvelle campagne</Link>
      {/* Les ouvertures et les clics vivent chez le routeur : un passage horaire
          les ingere. Une heure est courte pour une vraie campagne, longue quand
          on vient d'ouvrir soi-meme le message de test. */}
      <button className="btn" disabled={rafraichit} onClick={async () => {
        setRafraichit(true); setMsg("Relève des ouvertures et des clics…");
        const r = await fetch(`/capgrowth/api/rafraichir`, { method: "POST" });
        const j = await r.json();
        setRafraichit(false);
        if (!r.ok) { setMsg(j.erreur); return; }
        setMsg(j.resume);
        charger();
      }}>{rafraichit ? "…" : "Rafraîchir les compteurs"}</button>
      {msg && <span style={{ color: "var(--ink-2)", fontSize: 11 }}>{msg}</span>}
    </div>
    <div style={{ overflowX: "auto", background: "var(--card)", borderRadius: "var(--r)",
      border: "1px solid var(--hair-soft)", boxShadow: "var(--shadow)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
        <thead><tr>{["Campagne", "Expéditeur", "Rythme", "Ciblées", "Envoyés", "En attente",
          "Ouverts", "Cliqués", "Réponses", "Rebonds", "", ""].map((h, i) =>
          <th key={i} style={{ textAlign: "left", padding: "9px 12px", fontSize: 10,
            color: "var(--ink-3)", borderBottom: "1px solid var(--hair-soft)" }}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(c => {
          const id = String(c.CAMPAIGN_ID);
          return (
            <Fragment key={id}>
              <tr style={{ borderBottom: "1px solid var(--hair-soft)" }}>
                <td style={{ padding: "8px 12px", fontWeight: 600 }}>{c.NAME}</td>
                <td style={{ padding: "8px 12px", color: "var(--ink-2)" }}>{c.EXPEDITEUR_EMAIL || "—"}</td>
                {/* Le rythme etait enregistre mais invisible : on ne pouvait pas
                    savoir depuis cet ecran qu'une campagne partait toute seule. */}
                <td style={{ padding: "8px 12px", color: "var(--ink-2)" }}>
                  {Number(c.CADENCE_MIN) > 0
                    ? <span className="pill">1 / {c.CADENCE_MIN} min · {LIBELLES[String(c.FENETRE)] || c.FENETRE}</span>
                    : <span style={{ color: "var(--ink-3)" }}>manuel</span>}
                </td>
                <td style={{ padding: "8px 12px" }}>{c.TOTAL_TARGETED}</td>
                <td style={{ padding: "8px 12px" }}>{c.ENVOYES}</td>
                <td style={{ padding: "8px 12px" }}>{c.EN_ATTENTE}</td>
                <td style={{ padding: "8px 12px" }}>{taux(Number(c.OUVERTS), Number(c.ENVOYES))}</td>
                <td style={{ padding: "8px 12px" }}>{taux(Number(c.CLIQUES), Number(c.ENVOYES))}</td>
                <td style={{ padding: "8px 12px" }}>{taux(Number(c.REPONDUS), Number(c.ENVOYES))}</td>
                <td style={{ padding: "8px 12px" }}>{c.REBONDS ? <span className="pill crit">{c.REBONDS}</span> : "—"}</td>
                <td style={{ padding: "8px 12px", position: "relative" }}>
                  {Number(c.EN_ATTENTE) > 0 && <>
                    <button className="btn" onClick={() => setBoite(boite === id ? null : id)}>
                      Envoyer…</button>
                    {boite === id && <BoiteEnvoi c={c} surFermer={() => setBoite(null)}
                      surEnvoye={m => { setMsg(m); charger(); }} />}
                  </>}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <button className="btn" onClick={() => setOuverte(ouverte === id ? null : id)}>
                    {ouverte === id ? "Fermer" : "Modifier"}</button>
                </td>
              </tr>
              {ouverte === id && <Panneau c={c}
                surFermer={() => setOuverte(null)} surChange={charger} />}
            </Fragment>);
        })}
          {!rows.length && <tr><td colSpan={12} style={{ padding: 24, textAlign: "center",
            color: "var(--ink-3)" }}>Aucune campagne sur ce mandat.</td></tr>}
        </tbody>
      </table>
    </div>
  </>);
}

export default function PageCampagnes() {
  return (
    <MandatFournisseur>
      <Coquille section="campagnes">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Campagnes</h1>
        <p style={{ color: "var(--ink-3)" }}>Les taux se lisent sur les envois, jamais sur les cibles.
          Le plafond du jour vient du chauffage du domaine expéditeur. Ce qui est parti ne se
          modifie plus ; ce qui est en attente s&apos;ajoute et se retire.</p>
        <Campagnes />
      </Coquille>
    </MandatFournisseur>
  );
}
