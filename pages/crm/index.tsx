import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Coquille from "@/components/Coquille";
import FicheCrm from "@/components/FicheCrm";
import { MandatFournisseur, useMandat } from "@/lib/mandat";
import { COLONNES_PIPELINE, LIBELLES, exigeAction, TYPES_ACTION, type Statut } from "@/lib/crm";

type Fiche = Record<string, string | number | null>;

/*
 * Pipeline glissable. Glisser une carte change son statut sur CE mandat.
 *
 * Si la colonne d'arrivee exige une prochaine action (contrainte
 * CK_CS_ACTION_DUE), une mini-boite la demande avant de valider — la regle
 * reste en base, l'ecran ne fait que la rendre agreable.
 */
function Pipeline({ surOuvrir }: { surOuvrir: (k: string) => void }) {
  const { mandat } = useMandat();
  const [colonnes, setColonnes] = useState<Record<string, Fiche[]>>({});
  const [reserve, setReserve] = useState(0);
  const [mien, setMien] = useState(false);
  const [glisse, setGlisse] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [demande, setDemande] = useState<{ k: string; statut: string } | null>(null);
  const [action, setAction] = useState({ action_type: "relance", action_le: "" });
  const [msg, setMsg] = useState("");

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/pipeline?client=${mandat.ID}${mien ? "&mien=1" : ""}`)
      .then(r => r.json()).then(d => { setColonnes(d.colonnes || {}); setReserve(d.reserve || 0); });
  }, [mandat, mien]);
  useEffect(charger, [charger]);

  async function poser(k: string, statut: string, extra: Record<string, string> = {}) {
    const r = await fetch(`/capgrowth/api/etat/${encodeURIComponent(k)}?client=${mandat?.ID}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut, ...extra }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return false; }
    setMsg(""); charger(); return true;
  }

  async function deposer(statut: string) {
    const k = glisse; setGlisse(null); setSurvol(null);
    if (!k) return;
    if (exigeAction(statut)) {
      // Par defaut : dans une semaine. Une echeance proposee vaut mieux
      // qu'un champ vide qu'on remplit au hasard.
      const d = new Date(); d.setDate(d.getDate() + 7);
      setAction({ action_type: "relance", action_le: d.toISOString().slice(0, 10) });
      setDemande({ k, statut });
      return;
    }
    await poser(k, statut);
  }

  return (<>
    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
      <label style={{ fontSize: 11 }}>
        <input type="checkbox" checked={mien} onChange={e => setMien(e.target.checked)} /> mes fiches
      </label>
      <span className="pill">{reserve.toLocaleString("fr-FR")} en réserve (à contacter)</span>
      <Link href="/crm/taches">Mes tâches →</Link>
      {msg && <span style={{ color: "var(--crit)", fontSize: 11 }}>{msg}</span>}
    </div>

    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 12 }}>
      {COLONNES_PIPELINE.map(s => (
        <div key={s} onDragOver={e => { e.preventDefault(); setSurvol(s); }}
          onDragLeave={() => setSurvol(v => v === s ? null : v)}
          onDrop={e => { e.preventDefault(); deposer(s); }}
          style={{ flex: "0 0 210px", background: survol === s ? "var(--card)" : "var(--bg-alt)",
            border: survol === s ? "2px dashed var(--blue)" : "2px solid transparent",
            borderRadius: "var(--r)", padding: 10, minHeight: 200 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
            {LIBELLES[s][0]} <span style={{ color: "var(--ink-3)" }}>{(colonnes[s] || []).length}</span>
          </div>
          {(colonnes[s] || []).map(f => {
            const j = f.JOURS as number | null;
            return (
              <div key={String(f.PERSON_KEY)} draggable
                onDragStart={() => setGlisse(String(f.PERSON_KEY))}
                onClick={() => surOuvrir(String(f.PERSON_KEY))}
                style={{ background: "var(--card)", border: "1px solid var(--hair-soft)",
                  borderRadius: 12, padding: "8px 10px", marginBottom: 6, cursor: "grab", fontSize: 11 }}>
                <b>{[f.FIRST_NAME, f.LAST_NAME].filter(Boolean).join(" ") || "—"}</b>
                <div style={{ color: "var(--ink-2)" }}>{f.COMPANY || "—"}</div>
                {j !== null && j !== undefined && (
                  <span className={`pill ${j < 0 ? "crit" : j === 0 ? "warn" : ""}`}>
                    {j < 0 ? `retard ${-j} j` : j === 0 ? "aujourd'hui" : `dans ${j} j`}</span>)}
                {f.PROPRIETAIRE && <span className="pill" style={{ marginLeft: 4 }}>{f.PROPRIETAIRE}</span>}
              </div>);
          })}
        </div>))}
    </div>

    {demande && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.25)",
        display: "grid", placeItems: "center", zIndex: 50 }} onClick={() => setDemande(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: "var(--card)",
          borderRadius: "var(--r)", padding: 22, width: 320, display: "grid", gap: 10 }}>
          <b style={{ fontSize: 12 }}>« {LIBELLES[demande.statut as Statut][0]} » exige une prochaine action</b>
          <select value={action.action_type}
            onChange={e => setAction({ ...action, action_type: e.target.value })}>
            {TYPES_ACTION.map(t => <option key={t} value={t}>{t}</option>)}</select>
          <input type="date" value={action.action_le}
            onChange={e => setAction({ ...action, action_le: e.target.value })} />
          <button className="btn bleu" onClick={async () => {
            if (await poser(demande.k, demande.statut, action)) setDemande(null);
          }}>Valider</button>
          <button className="btn" onClick={() => setDemande(null)}>Annuler</button>
        </div>
      </div>)}
  </>);
}

export default function PageCrm() {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [v, setV] = useState(0);
  return (
    <MandatFournisseur>
      <Coquille section="crm">
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Pipeline</h1>
        <p style={{ color: "var(--ink-3)", marginBottom: 10 }}>
          Glissez une fiche pour changer son état sur ce mandat. « À contacter »
          n&apos;est pas une colonne : c&apos;est la réserve.</p>
        <Pipeline key={v} surOuvrir={setOuvert} />
        {ouvert && <FicheCrm personKey={ouvert} onFermer={() => setOuvert(null)}
          onChange={() => setV(x => x + 1)} />}
      </Coquille>
    </MandatFournisseur>
  );
}
