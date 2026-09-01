import { useCallback, useEffect, useMemo, useState } from "react";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

type Modele = Record<string, string | number | null>;

/*
 * Le contact d'exemple de l'apercu.
 *
 * Les memes variables que celles fusionnees par le moteur d'envoi, avec les
 * memes noms. Un apercu qui montrerait « {{first_name}} » brut ne dirait rien
 * de ce que le destinataire recoit.
 */
const EXEMPLE: Record<string, string> = {
  first_name: "Benoit", last_name: "SIGWALD", full_name: "Benoit SIGWALD",
  company: "Arx Consulting", title: "Directeur",
  link: "https://arx-consulting.com/t/exemple",
  whatsapp: "https://arx-consulting.com/t/exemple-wa",
};

function fusionner(texte: string) {
  return Object.entries(EXEMPLE).reduce(
    (acc, [cle, val]) => acc.split(`{{${cle}}}`).join(val), String(texte || ""));
}

function Modeles() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Modele[]>([]);
  const [ed, setEd] = useState<Modele | null>(null);
  const [onglet, setOnglet] = useState<"html" | "texte" | "apercu">("html");
  const [msg, setMsg] = useState("");

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/modeles?client=${mandat.ID}`).then(r => r.json())
      .then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);

  // L'apercu se recalcule a chaque frappe : c'est tout l'interet d'un apercu.
  const apercu = useMemo(() => fusionner(String(ed?.CORPS_HTML ?? "")), [ed]);
  const sujet = useMemo(() => fusionner(String(ed?.SUBJECT ?? "")), [ed]);

  async function enregistrer() {
    if (!ed) return;
    setMsg("Enregistrement…");
    const r = await fetch(`/capgrowth/api/modeles?client=${mandat?.ID}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: ed.TEMPLATE_ID, nom: ed.NAME, langue: ed.LANGUAGE,
        sujet: ed.SUBJECT, corps: ed.CORPS, corps_html: ed.CORPS_HTML, actif: ed.IS_ACTIVE }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    // Ce qui a REELLEMENT ete ecrit, relu en base : c'est ce contenu-la qui
    // partira au prochain envoi.
    setMsg(`Enregistré en version ${j.version} — ${j.html || 0} caractères de HTML, `
      + `${j.texte || 0} de texte. C'est cette version qui part maintenant.`);
    charger();
  }

  const onglets: [typeof onglet, string][] = [
    ["html", "HTML — ce qui est envoyé"], ["texte", "Texte de repli"], ["apercu", "Aperçu"]];

  return (<>
    <button className="btn bleu" style={{ marginBottom: 14 }}
      onClick={() => { setOnglet("html"); setMsg(""); setEd({ TEMPLATE_ID: "", NAME: "",
        LANGUAGE: "fr", SUBJECT: "", CORPS: "", CORPS_HTML: "", IS_ACTIVE: 1,
        CLIENT_ID: mandat?.ID ?? null }); }}>Nouveau gabarit</button>

    {rows.map(m => (
      <div key={String(m.TEMPLATE_ID)} style={{ padding: "10px 0",
        borderBottom: "1px solid var(--hair-soft)", display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{m.NAME || m.TEMPLATE_ID}</b>{" "}
          <span className="pill">{m.LANGUAGE}</span>{" "}
          <span className="pill">v{m.VERSION}</span>{" "}
          <span className={`pill ${m.IS_ACTIVE ? "ok" : ""}`}>{m.IS_ACTIVE ? "actif" : "inactif"}</span>{" "}
          <span className={`pill ${m.CLIENT_ID ? "" : "warn"}`}>
            {m.CLIENT_ID ? "ce mandat" : "partagé Arx"}</span>{" "}
          {!String(m.CORPS_HTML ?? "") && <span className="pill crit">sans HTML</span>}
          <div style={{ color: "var(--ink-2)", fontSize: 11 }}>{m.SUBJECT}</div>
        </div>
        <button className="btn" onClick={() => { setOnglet("html"); setMsg(""); setEd({ ...m }); }}>
          Ouvrir</button>
      </div>))}
    {!rows.length && <p style={{ color: "var(--ink-3)" }}>Aucun gabarit.</p>}

    {ed && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.25)", zIndex: 50,
        display: "grid", placeItems: "center" }} onClick={() => setEd(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: "var(--card)",
          borderRadius: "var(--r)", padding: 22, width: "min(920px, 94vw)",
          maxHeight: "92vh", overflowY: "auto", display: "grid", gap: 10 }}>
          <b style={{ fontSize: 13 }}>
            {ed.TEMPLATE_ID ? `Gabarit ${ed.TEMPLATE_ID}` : "Nouveau gabarit"}
            {ed.VERSION ? ` — version ${ed.VERSION}` : ""}</b>
          {!ed.VERSION && <input placeholder="Identifiant (ex. super-cannes-fr)"
            value={String(ed.TEMPLATE_ID ?? "")}
            onChange={e => setEd({ ...ed, TEMPLATE_ID: e.target.value })} />}
          <input placeholder="Nom" value={String(ed.NAME ?? "")}
            onChange={e => setEd({ ...ed, NAME: e.target.value })} />
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8 }}>
            <select value={String(ed.LANGUAGE ?? "fr")}
              onChange={e => setEd({ ...ed, LANGUAGE: e.target.value })}>
              <option value="fr">fr</option><option value="en">en</option>
            </select>
            <input placeholder="Objet" value={String(ed.SUBJECT ?? "")}
              onChange={e => setEd({ ...ed, SUBJECT: e.target.value })} />
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            {onglets.map(([id, libelle]) => (
              <button key={id} className={`btn ${onglet === id ? "bleu" : ""}`}
                onClick={() => setOnglet(id)}>{libelle}</button>))}
          </div>

          {onglet === "html" && (
            <textarea rows={20} spellCheck={false}
              style={{ width: "100%", fontFamily: "monospace", fontSize: 11 }}
              value={String(ed.CORPS_HTML ?? "")}
              onChange={e => setEd({ ...ed, CORPS_HTML: e.target.value })} />)}

          {onglet === "texte" && (<>
            <textarea rows={20} spellCheck={false}
              style={{ width: "100%", fontFamily: "monospace", fontSize: 11 }}
              value={String(ed.CORPS ?? "")}
              onChange={e => setEd({ ...ed, CORPS: e.target.value })} />
            <span className="pill warn">
              Version texte, lue par les clients qui refusent le HTML. Elle doit dire la même
              chose que le HTML : c&apos;est en les laissant diverger qu&apos;un rendement de
              8 % s&apos;est retrouvé face à un rendement de 10 %.</span>
          </>)}

          {onglet === "apercu" && (<>
            <div style={{ fontSize: 11, color: "var(--ink-2)" }}>
              <b>Objet :</b> {sujet || <i>(vide)</i>}</div>
            {/* Bac a sable : le gabarit est du HTML arbitraire, il ne doit ni
                executer de script ni naviguer dans l'application. */}
            <iframe title="Aperçu" sandbox="" srcDoc={apercu}
              style={{ width: "100%", height: "62vh", border: "1px solid var(--hair)",
                borderRadius: 10, background: "#fff" }} />
            <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
              Variables remplacées par un contact d&apos;exemple ({EXEMPLE.full_name}), comme le
              fait le moteur d&apos;envoi. Le lien de suivi est factice ici.</span>
          </>)}

          <div style={{ fontSize: 10, color: "var(--ink-3)" }}>
            Variables : <code>{"{{first_name}}"}</code>, <code>{"{{last_name}}"}</code>,{" "}
            <code>{"{{full_name}}"}</code>, <code>{"{{company}}"}</code>,{" "}
            <code>{"{{title}}"}</code>, <code>{"{{link}}"}</code>,{" "}
            <code>{"{{whatsapp}}"}</code>. Enregistrer crée une <b>nouvelle version</b> —
            les envois passés gardent le contenu qui leur a été appliqué.
          </div>
          <label style={{ fontSize: 11 }}>
            <input type="checkbox" checked={!!ed.IS_ACTIVE}
              onChange={e => setEd({ ...ed, IS_ACTIVE: e.target.checked ? 1 : 0 })} /> actif
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn bleu" onClick={enregistrer}>Enregistrer</button>
            <button className="btn" onClick={() => setEd(null)}>Fermer</button>
          </div>
          {msg && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{msg}</span>}
        </div>
      </div>)}
  </>);
}

export default function PageModeles() {
  return (
    <MandatFournisseur>
      <Coquille section="modeles">
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Modèles</h1>
        <p style={{ color: "var(--ink-3)", marginBottom: 14 }}>
          Le <b>HTML est ce que le destinataire voit</b> ; le texte n&apos;est qu&apos;un repli.
          Un gabarit du mandat prime sur un gabarit partagé de même langue. Ils sont
          <b> versionnés et jamais supprimés</b> : un envoi passé garde le contenu exact qui lui
          a été appliqué.</p>
        <Modeles />
      </Coquille>
    </MandatFournisseur>
  );
}
