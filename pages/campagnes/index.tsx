import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

const taux = (n: number, d: number) => d ? `${n} (${Math.round(100 * n / d)} %)` : "—";
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
  const [msg, setMsg] = useState("");
  const envoyes = Number(c.ENVOYES) || 0;
  const attente = Number(c.EN_ATTENTE) || 0;

  useEffect(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/segments?client=${mandat.ID}`).then(r => r.json())
      .then(d => setSegments(d.rows || []));
    fetch(`/capgrowth/api/listes?client=${mandat.ID}`).then(r => r.json())
      .then(d => setListes(d.rows || []));
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
    <tr><td colSpan={11} style={{ background: "var(--bg-alt)", padding: "14px 16px" }}>
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
              ...(type === "s" ? { segment_id: Number(id) } : { liste_id: Number(id) }) },
              "Préparation…");
            if (j) setMsg(`${j.prepares} envoi(s) ajouté(s)`
              + (j.ignores?.deja_cible ? ` — ${j.ignores.deja_cible} déjà ciblé(s) par cette campagne` : "")
              + (j.contacts_crees ? `, ${j.contacts_crees} nouveau(x) destinataire(s)` : "") + ".");
          }}>Ajouter</button>
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

function Campagnes() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Ligne[]>([]);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [rafraichit, setRafraichit] = useState(false);

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/campagnes?client=${mandat.ID}`).then(r => r.json())
      .then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);

  async function envoyer(id: string) {
    setMsg("Envoi du lot…");
    const r = await fetch(`/capgrowth/api/campagnes/${encodeURIComponent(id)}/envoyer?client=${mandat?.ID}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lot: 20 }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    // La reponse du mailer fait foi : plafond et journees viennent de lui.
    setMsg(`${j.envoyes} envoyé(s) — plafond du jour ${j.plafond} (jour d'envoi n°${(j.journees_d_envoi ?? 0) + 1}), reste ${j.restant_aujourdhui}.`);
    charger();
  }

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
        <thead><tr>{["Campagne", "Expéditeur", "Ciblées", "Envoyés", "En attente",
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
                <td style={{ padding: "8px 12px" }}>{c.TOTAL_TARGETED}</td>
                <td style={{ padding: "8px 12px" }}>{c.ENVOYES}</td>
                <td style={{ padding: "8px 12px" }}>{c.EN_ATTENTE}</td>
                <td style={{ padding: "8px 12px" }}>{taux(Number(c.OUVERTS), Number(c.ENVOYES))}</td>
                <td style={{ padding: "8px 12px" }}>{taux(Number(c.CLIQUES), Number(c.ENVOYES))}</td>
                <td style={{ padding: "8px 12px" }}>{taux(Number(c.REPONDUS), Number(c.ENVOYES))}</td>
                <td style={{ padding: "8px 12px" }}>{c.REBONDS ? <span className="pill crit">{c.REBONDS}</span> : "—"}</td>
                <td style={{ padding: "8px 12px" }}>
                  {Number(c.EN_ATTENTE) > 0 &&
                    <button className="btn" onClick={() => envoyer(id)}>Envoyer un lot</button>}
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
          {!rows.length && <tr><td colSpan={11} style={{ padding: 24, textAlign: "center",
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
