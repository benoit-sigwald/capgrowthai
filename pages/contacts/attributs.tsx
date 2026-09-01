import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

const REFERENTIEL = ["Prénom", "Nom", "Titre", "Société", "E-mail", "Téléphone",
  "LinkedIn", "Ville", "Pays", "Notes", "Source", "Territoire", "Secteur"];

function Attributs() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<{ ID: number; NOM: string; TYPE: string }[]>([]);
  const [nom, setNom] = useState("");
  const [type, setType] = useState("texte");
  const [msg, setMsg] = useState("");
  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/attributs?client=${mandat.ID}`).then(r => r.json()).then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);
  async function creer() {
    if (!nom || !mandat) return;
    const r = await fetch(`/capgrowth/api/attributs?client=${mandat.ID}`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: mandat.ID, nom, type }) });
    const j = await r.json();
    setMsg(r.ok ? "" : j.erreur); if (r.ok) { setNom(""); charger(); }
  }
  return (<>
    <h3 style={{ fontSize: 12, margin: "10px 0" }}>Attributs du référentiel (figés)</h3>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {REFERENTIEL.map(a => <span key={a} className="pill">{a}</span>)}
    </div>
    <h3 style={{ fontSize: 12, margin: "18px 0 10px" }}>Champs libres du mandat</h3>
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <input placeholder="Nom du champ" value={nom} onChange={e => setNom(e.target.value)} />
      <select value={type} onChange={e => setType(e.target.value)}>
        <option value="texte">texte</option><option value="nombre">nombre</option><option value="date">date</option>
      </select>
      <button className="btn bleu" onClick={creer}>Créer</button>
      {msg && <span style={{ color: "var(--crit)", alignSelf: "center" }}>{msg}</span>}
    </div>
    {rows.map(a => <div key={a.ID} style={{ padding: "6px 0",
      borderBottom: "1px solid var(--hair-soft)" }}>{a.NOM} <span className="pill">{a.TYPE}</span></div>)}
  </>);
}

export default function PageAttributs() {
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="attributs" />
        <Attributs />
      </Coquille>
    </MandatFournisseur>
  );
}
