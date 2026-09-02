import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

type Ligne = { type: string; nom: string; valeur: string; motif: string };

function Expediteurs() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Record<string, never>[]>([]);
  const [mode, setMode] = useState("");
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [chauffe, setChauffe] = useState<Record<string, Record<string, unknown>>>({});
  const [msg, setMsg] = useState("");
  // L'expediteur dont on edite la signature, ou rien.
  const [signature, setSignature] = useState<Record<string, string | number | null> | null>(null);

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/expediteurs?client=${mandat.ID}`).then(r => r.json())
      .then(d => { setRows(d.rows || []); setMode(d.mode || ""); });
  }, [mandat]);
  useEffect(charger, [charger]);

  async function ajouter() {
    if (!mandat) return;
    setMsg("Déclaration chez Brevo puis vérification DNS…");
    const r = await fetch(`/capgrowth/api/expediteurs?client=${mandat.ID}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, nom }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    setLignes(j.verdict?.lignes_a_coller || []);
    setMsg(j.verdict?.spf_ok && j.verdict?.dkim_ok
      ? "Domaine authentifié — prêt à envoyer."
      : "Domaine incomplet : collez les lignes ci-dessous chez le registrar, puis revérifiez.");
    setEmail(""); setNom(""); charger();
  }

  async function reverifier(id: number) {
    setMsg("Vérification DNS…");
    const r = await fetch(`/capgrowth/api/expediteurs/${id}/verifier`, { method: "POST" });
    const j = await r.json();
    setLignes(j.lignes_a_coller || []);
    setMsg(j.spf_ok && j.dkim_ok ? "Domaine authentifié." : "Il manque encore des enregistrements.");
    charger();
  }

  async function voirChauffage(id: number) {
    const j = await (await fetch(`/capgrowth/api/chauffage?expediteur=${id}`)).json();
    setChauffe(c => ({ ...c, [id]: j }));
  }

  return (<>
    <p style={{ color: "var(--ink-3)" }}>Mode du mandat : <b>{mode === "utilisateur"
      ? "chaque utilisateur envoie sous sa propre adresse" : "adresses communes au mandat"}</b>.
      Un domaine non authentifié ne part pas — chaque envoi échouerait SPF et brûlerait le domaine.</p>
    <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
      <input placeholder="adresse@domaine.ch" value={email} onChange={e => setEmail(e.target.value)} style={{ width: 240 }} />
      <input placeholder="Nom affiché" value={nom} onChange={e => setNom(e.target.value)} />
      <button className="btn bleu" onClick={ajouter} disabled={!email || !nom}>Ajouter</button>
    </div>
    {msg && <p style={{ fontSize: 11, color: "var(--ink-2)" }}>{msg}</p>}
    {lignes.length > 0 && (
      <div style={{ background: "var(--bg-alt)", borderRadius: 12, padding: 14, margin: "10px 0" }}>
        <b style={{ fontSize: 11 }}>Lignes DNS à coller (exactement) :</b>
        {lignes.map((l, i) => (
          <div key={i} style={{ marginTop: 8, fontSize: 11 }}>
            <code style={{ display: "block", background: "var(--card)", padding: 8, borderRadius: 8 }}>
              {l.type} &nbsp; {l.nom} &nbsp; {l.valeur}</code>
            <span style={{ color: "var(--ink-3)" }}>{l.motif}</span>
          </div>))}
      </div>)}
    {rows.map(x => (
      <div key={x["ID"]} style={{ padding: "10px 0", borderBottom: "1px solid var(--hair-soft)", fontSize: 12 }}>
        <b>{x["EMAIL"]}</b> · {x["NOM_AFFICHAGE"]}
        {!x["SOCIETE"] && <span className="pill warn" style={{ marginLeft: 6 }}>signature incomplète</span>}
        <span className={`pill ${x["SPF_OK"] ? "ok" : "crit"}`} style={{ marginLeft: 8 }}>SPF</span>
        <span className={`pill ${x["DKIM_OK"] ? "ok" : "crit"}`} style={{ marginLeft: 4 }}>DKIM</span>
        <button className="btn" style={{ marginLeft: 10 }} onClick={() => reverifier(Number(x["ID"]))}>Revérifier</button>
        <button className="btn" style={{ marginLeft: 6 }} onClick={() => voirChauffage(Number(x["ID"]))}>Chauffage</button>
        <button className="btn" style={{ marginLeft: 6 }}
          onClick={() => setSignature(signature?.ID === x["ID"] ? null : { ...x })}>
          {signature?.ID === x["ID"] ? "Fermer" : "Signature"}</button>
        {signature?.ID === x["ID"] && (
          <div style={{ display: "grid", gap: 6, marginTop: 10, maxWidth: 520 }}>
            <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
              Ce bloc est ajouté mot pour mot au bas des réponses. Il n&apos;est jamais rédigé
              par l&apos;IA : une signature porte un téléphone et une adresse, et un modèle qui
              en invente un ne se fait pas relire.
            </span>
            {([["PRENOM", "Prénom"], ["NOM", "Nom"], ["FONCTION", "Fonction"],
               ["SOCIETE", "Société"], ["ADRESSE", "Adresse"], ["TELEPHONE", "Téléphone"],
               ["SITE", "Site web"]] as const).map(([cle, libelle]) => (
              <input key={cle} placeholder={libelle} value={String(signature[cle] ?? "")}
                onChange={e => setSignature({ ...signature, [cle]: e.target.value })} />))}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn bleu" onClick={async () => {
                const r = await fetch(`/capgrowth/api/expediteurs?client=${mandat?.ID}`, {
                  method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: signature.ID, prenom: signature.PRENOM,
                    nom: signature.NOM, fonction: signature.FONCTION, societe: signature.SOCIETE,
                    adresse: signature.ADRESSE, telephone: signature.TELEPHONE,
                    site: signature.SITE }) });
                const j = await r.json();
                setMsg(r.ok ? "Signature enregistrée." : j.erreur);
                if (r.ok) { setSignature(null); charger(); }
              }}>Enregistrer</button>
              <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
                Aperçu : {[signature.PRENOM, signature.NOM].filter(Boolean).join(" ")}
                {signature.SOCIETE ? ` · ${signature.SOCIETE}` : ""}
                {signature.TELEPHONE ? ` · ${signature.TELEPHONE}` : ""}
              </span>
            </div>
          </div>)}
        {chauffe[String(x["ID"])] && (
          <div style={{ color: "var(--ink-2)", marginTop: 4 }}>
            Domaine {String(chauffe[String(x["ID"])]["domaine"])} — jour d&apos;envoi n°{Number(chauffe[String(x["ID"])]["journees"]) + 1},
            plafond {String(chauffe[String(x["ID"])]["plafond"])}/jour,
            envoyés aujourd&apos;hui {String(chauffe[String(x["ID"])]["envoyes_aujourdhui"])},
            restant {String(chauffe[String(x["ID"])]["restant"])}
          </div>)}
      </div>))}
  </>);
}

export default function PageExpediteurs() {
  return (
    <MandatFournisseur>
      <Coquille section="parametres">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Expéditeurs</h1>
        <Expediteurs />
      </Coquille>
    </MandatFournisseur>
  );
}
