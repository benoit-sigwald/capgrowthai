import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

function Segments() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [nom, setNom] = useState("");
  const [filtre, setFiltre] = useState({ source: "investors", canal: "email", pays: "" });
  const [apercu, setApercu] = useState<{ total: number } | null>(null);

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/segments?client=${mandat.ID}`).then(r => r.json()).then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);

  async function creer() {
    if (!nom || !mandat) return;
    await fetch(`/capgrowth/api/segments?client=${mandat.ID}`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: mandat.ID, nom, filtre }) });
    setNom(""); charger();
  }
  async function voir(id: number) {
    const d = await (await fetch(`/capgrowth/api/segments/${id}?client=${mandat?.ID}`)).json();
    setApercu({ total: d.total });
  }

  return (<>
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <input placeholder="Nom du segment" value={nom} onChange={e => setNom(e.target.value)} />
      <select value={filtre.source} onChange={e => setFiltre({ ...filtre, source: e.target.value })}>
        <option value="investors">Investisseurs</option><option value="prospects">Prospects PACA</option>
        <option value="gate">Formulaires</option><option value="">Toutes bases</option>
      </select>
      <select value={filtre.canal} onChange={e => setFiltre({ ...filtre, canal: e.target.value })}>
        <option value="email">E-mail</option><option value="linkedin">LinkedIn</option>
        <option value="joignable">Joignable</option>
      </select>
      <input placeholder="Pays (FR…)" value={filtre.pays} style={{ width: 90 }}
        onChange={e => setFiltre({ ...filtre, pays: e.target.value })} />
      <button className="btn bleu" onClick={creer}>Enregistrer le segment</button>
    </div>
    {apercu && <p><span className="pill ok">{apercu.total.toLocaleString("fr-FR")} personnes aujourd&apos;hui</span></p>}
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
      <tbody>{rows.map(s => (
        <tr key={String(s.ID)} style={{ borderBottom: "1px solid var(--hair-soft)" }}>
          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{String(s.NOM)}</td>
          <td style={{ padding: "8px 12px", color: "var(--ink-3)" }}>{JSON.stringify(s.FILTRE)}</td>
          <td style={{ padding: "8px 12px" }}>
            <button className="btn" onClick={() => voir(Number(s.ID))}>Compter aujourd&apos;hui</button></td>
        </tr>))}
      </tbody>
    </table>
  </>);
}

export default function PageSegments() {
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="segments" />
        <p style={{ color: "var(--ink-3)" }}>Un segment est un filtre rejoué à chaque usage —
          il rend l&apos;état du référentiel du jour, pas une photo.</p>
        <Segments />
      </Coquille>
    </MandatFournisseur>
  );
}
