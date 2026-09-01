import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Coquille from "@/components/Coquille";
import { MandatFournisseur } from "@/lib/mandat";

type Ligne = Record<string, string | number | null>;
type Mandat = { ID: number; NOM: string };
type Aff = { UTILISATEUR_ID: number; CLIENT_ID: number; ROLE: string };

function Mandats({ surChange }: { surChange: () => void }) {
  const [rows, setRows] = useState<Ligne[]>([]);
  const [nom, setNom] = useState("");
  const [mode, setMode] = useState("mandat");
  const [edite, setEdite] = useState<{ id: number; nom: string; mode: string } | null>(null);
  const [msg, setMsg] = useState("");

  const charger = useCallback(() => {
    fetch("/capgrowth/api/clients").then(r => r.json()).then(d => setRows(d.rows || []));
  }, []);
  useEffect(charger, [charger]);

  async function envoyer(corps: unknown, methode = "POST") {
    const r = await fetch("/capgrowth/api/clients", { method: methode,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return false; }
    setMsg(""); charger(); surChange(); return true;
  }
  async function supprimer(c: Ligne) {
    if (!confirm(`Supprimer le mandat « ${c.NOM} » ? Ses segments, listes, expéditeurs et `
      + `affectations partent avec lui. Les contacts eux-mêmes ne sont pas touchés.`)) return;
    await envoyer({ id: c.ID }, "DELETE");
  }

  return (<>
    <h2 style={{ fontSize: 15, margin: "8px 0" }}>Mandats</h2>
    <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
      <input placeholder="Nom du mandat" value={nom} onChange={e => setNom(e.target.value)} />
      <select value={mode} onChange={e => setMode(e.target.value)}
        title="Qui envoie : le mandat (adresses communes) ou chaque utilisateur sous la sienne">
        <option value="mandat">Expéditeur de mandat</option>
        <option value="utilisateur">Expéditeur par utilisateur</option>
      </select>
      <button className="btn bleu" disabled={!nom.trim()}
        onClick={async () => { if (await envoyer({ nom, mode })) setNom(""); }}>Créer</button>
      {msg && <span className="pill crit" style={{ alignSelf: "center" }}>{msg}</span>}
    </div>

    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
      <tbody>{rows.map(c => edite?.id === c.ID ? (
        <tr key={String(c.ID)} style={{ borderBottom: "1px solid var(--hair-soft)" }}>
          <td colSpan={3} style={{ padding: "8px 0" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={edite.nom} onChange={e => setEdite({ ...edite, nom: e.target.value })} />
              <select value={edite.mode} onChange={e => setEdite({ ...edite, mode: e.target.value })}>
                <option value="mandat">Expéditeur de mandat</option>
                <option value="utilisateur">Expéditeur par utilisateur</option>
              </select>
              <button className="btn bleu" onClick={async () => {
                if (await envoyer({ id: edite.id, nom: edite.nom, mode: edite.mode })) setEdite(null);
              }}>Enregistrer</button>
              <button className="btn" onClick={() => setEdite(null)}>Annuler</button>
            </div>
          </td>
        </tr>) : (
        <tr key={String(c.ID)} style={{ borderBottom: "1px solid var(--hair-soft)" }}>
          <td style={{ padding: "7px 0" }}>
            <b>{c.NOM}</b> <span className="pill">{c.MODE_EXPEDITEUR}</span></td>
          <td style={{ padding: "7px 8px", color: "var(--ink-3)" }}>
            {c.UTILISATEURS} utilisateur(s) · {c.EXPEDITEURS} expéditeur(s) ·
            {" "}{c.SEGMENTS} segment(s) · {c.CAMPAGNES} campagne(s)</td>
          <td style={{ padding: "7px 0", textAlign: "right", whiteSpace: "nowrap" }}>
            <button className="btn" onClick={() => setEdite({ id: Number(c.ID),
              nom: String(c.NOM), mode: String(c.MODE_EXPEDITEUR) })}>Modifier</button>
            <button className="btn" style={{ marginLeft: 6, color: "var(--crit)" }}
              onClick={() => supprimer(c)}>Supprimer</button></td>
        </tr>))}
        {!rows.length && <tr><td style={{ padding: 16, color: "var(--ink-3)" }}>Aucun mandat.</td></tr>}
      </tbody>
    </table>
  </>);
}

/*
 * Le role se donne mandat par mandat. « membre » travaille le referentiel
 * partage ; « client » ne voit que son mandat. Un administrateur voit tout par
 * construction : ses affectations ne changeraient rien, on le dit plutot que
 * de laisser croire le contraire.
 */
function DroitsMandats({ mandats, valeur, surChange }: {
  mandats: Mandat[]; valeur: Record<number, string>;
  surChange: (v: Record<number, string>) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 4, margin: "6px 0" }}>
      {mandats.map(m => {
        const r = valeur[m.ID];
        return (
          <div key={m.ID} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
            <input type="checkbox" checked={!!r} onChange={e => {
              const v = { ...valeur };
              if (e.target.checked) v[m.ID] = "membre"; else delete v[m.ID];
              surChange(v);
            }} />
            <span style={{ minWidth: 170 }}>{m.NOM}</span>
            <select value={r || "membre"} disabled={!r}
              onChange={e => surChange({ ...valeur, [m.ID]: e.target.value })}>
              <option value="membre">membre — accès au référentiel</option>
              <option value="client">client — ce mandat seulement</option>
            </select>
          </div>);
      })}
      {!mandats.length && <span className="pill warn">Créez d&apos;abord un mandat.</span>}
    </div>);
}

function Utilisateurs() {
  const [rows, setRows] = useState<Ligne[]>([]);
  const [affs, setAffs] = useState<Aff[]>([]);
  const [mandats, setMandats] = useState<Mandat[]>([]);
  const [f, setF] = useState({ email: "", nom: "", role: "membre",
    droits: {} as Record<number, string> });
  const [edite, setEdite] = useState<{ id: number; nom: string; role: string;
    droits: Record<number, string> } | null>(null);
  const [msg, setMsg] = useState("");

  const charger = useCallback(() => {
    fetch("/capgrowth/api/utilisateurs").then(r => r.json())
      .then(d => { setRows(d.rows || []); setAffs(d.affectations || []); });
    fetch("/capgrowth/api/clients").then(r => r.json()).then(d => setMandats(d.rows || []));
  }, []);
  useEffect(charger, [charger]);

  const enTableau = (d: Record<number, string>) =>
    Object.entries(d).map(([client_id, role]) => ({ client_id: Number(client_id), role }));

  async function creer() {
    const r = await fetch("/capgrowth/api/utilisateurs", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, affectations: enTableau(f.droits) }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    setMsg(`Mot de passe initial de ${f.email} : ${j.motdepasse_initial} — transmettez-le par `
      + `un canal sûr, il ne sera plus jamais affiché.`);
    setF({ email: "", nom: "", role: "membre", droits: {} }); charger();
  }
  async function agir(corps: unknown, methode: string) {
    const r = await fetch("/capgrowth/api/utilisateurs", { method: methode,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return null; }
    setMsg(j.motdepasse_initial
      ? `Nouveau mot de passe : ${j.motdepasse_initial} — affiché une seule fois.`
      : (j.message || ""));
    charger(); return j;
  }

  return (<>
    <h2 style={{ fontSize: 15, margin: "22px 0 8px" }}>Utilisateurs</h2>
    <div style={{ border: "1px solid var(--hair)", borderRadius: "var(--r)", padding: 12,
      marginBottom: 12, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="E-mail" value={f.email}
          onChange={e => setF({ ...f, email: e.target.value })} />
        <input placeholder="Nom" value={f.nom} style={{ width: 130 }}
          onChange={e => setF({ ...f, nom: e.target.value })} />
        <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}
          title="« administrateur » donne accès à tout, mandats compris">
          <option value="membre">compte normal</option>
          <option value="admin">administrateur</option>
        </select>
        <button className="btn bleu" disabled={!f.email} onClick={creer}>Créer</button>
      </div>
      {f.role !== "admin"
        ? <DroitsMandats mandats={mandats} valeur={f.droits}
            surChange={d => setF({ ...f, droits: d })} />
        : <span className="pill">Un administrateur accède à tous les mandats.</span>}
    </div>
    {msg && <p className="pill warn" style={{ fontSize: 11 }}>{msg}</p>}

    {rows.map(u => {
      const id = Number(u.ID);
      const siens = affs.filter(a => a.UTILISATEUR_ID === id);
      return edite?.id === id ? (
        <div key={id} style={{ border: "1px solid var(--hair)", borderRadius: "var(--r)",
          padding: 12, marginBottom: 8, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <b>{String(u.EMAIL)}</b>
            <input value={edite.nom} placeholder="Nom" style={{ width: 130 }}
              onChange={e => setEdite({ ...edite, nom: e.target.value })} />
            <select value={edite.role} onChange={e => setEdite({ ...edite, role: e.target.value })}>
              <option value="membre">compte normal</option>
              <option value="admin">administrateur</option>
            </select>
          </div>
          {edite.role !== "admin"
            ? <DroitsMandats mandats={mandats} valeur={edite.droits}
                surChange={d => setEdite({ ...edite, droits: d })} />
            : <span className="pill">Un administrateur accède à tous les mandats.</span>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn bleu" onClick={async () => {
              if (await agir({ id, nom: edite.nom, role: edite.role,
                affectations: enTableau(edite.droits) }, "PATCH")) setEdite(null);
            }}>Enregistrer</button>
            <button className="btn" onClick={() => setEdite(null)}>Annuler</button>
            <button className="btn" onClick={() => {
              if (confirm(`Réinitialiser le mot de passe de ${u.EMAIL} ? L'ancien cessera de fonctionner.`))
                agir({ id, reinitialiser: true }, "PATCH");
            }}>Réinitialiser le mot de passe</button>
            <button className="btn" onClick={() =>
              agir({ id, actif: u.ACTIF === 1 ? 0 : 1 }, "PATCH")}>
              {u.ACTIF === 1 ? "Désactiver" : "Réactiver"}</button>
            <button className="btn" style={{ color: "var(--crit)" }} onClick={() => {
              if (confirm(`Supprimer le compte ${u.EMAIL} ?`))
                agir({ id }, "DELETE").then(j => { if (j) setEdite(null); });
            }}>Supprimer</button>
          </div>
        </div>
      ) : (
        <div key={id} style={{ padding: "6px 0", borderBottom: "1px solid var(--hair-soft)",
          fontSize: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b>{String(u.EMAIL)}</b>
          {u.ROLE === "admin" && <span className="pill">administrateur</span>}
          {u.ACTIF !== 1 && <span className="pill crit">désactivé</span>}
          <span style={{ color: "var(--ink-3)" }}>
            {u.ROLE === "admin" ? "tous les mandats" : (u.MANDATS || "aucun mandat")}</span>
          <button className="btn" style={{ marginLeft: "auto" }}
            onClick={() => setEdite({ id, nom: String(u.NOM ?? ""), role: String(u.ROLE),
              droits: Object.fromEntries(siens.map(a => [a.CLIENT_ID, a.ROLE])) })}>
            Modifier</button>
        </div>);
    })}
  </>);
}

export default function PageParametres() {
  const { data: session } = useSession();
  const admin = (session as never as { portee?: { role: string } })?.portee?.role === "admin";
  const [version, setVersion] = useState(0);
  return (
    <MandatFournisseur>
      <Coquille section="parametres">
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Paramètres</h1>
        <p style={{ marginBottom: 14 }}>
          <Link href="/parametres/expediteurs">Expéditeurs et authentification de domaine →</Link>
        </p>
        {admin ? (<><Mandats surChange={() => setVersion(v => v + 1)} />
                    <Utilisateurs key={version} /></>)
          : <p className="pill warn">Mandats et utilisateurs : réservé à l&apos;administrateur.</p>}
      </Coquille>
    </MandatFournisseur>
  );
}
