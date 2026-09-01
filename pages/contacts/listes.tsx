import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

function Listes() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [nom, setNom] = useState("");
  const [membres, setMembres] = useState<Record<string, string>[] | null>(null);

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/listes?client=${mandat.ID}`).then(r => r.json()).then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);

  async function creer() {
    if (!nom || !mandat) return;
    await fetch(`/capgrowth/api/listes?client=${mandat.ID}`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: mandat.ID, nom }) });
    setNom(""); charger();
  }
  async function ouvrir(id: number) {
    const d = await (await fetch(`/capgrowth/api/listes/${id}`)).json();
    setMembres(d.rows);
  }
  return (<>
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input placeholder="Nom de la liste" value={nom} onChange={e => setNom(e.target.value)} />
      <button className="btn bleu" onClick={creer}>Créer</button>
    </div>
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
      <tbody>{rows.map(l => (
        <tr key={String(l.ID)} style={{ borderBottom: "1px solid var(--hair-soft)", cursor: "pointer" }}
          onClick={() => ouvrir(Number(l.ID))}>
          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{String(l.NOM)}</td>
          <td style={{ padding: "8px 12px" }}>{String(l.MEMBRES)} membre(s)</td>
        </tr>))}
      </tbody>
    </table>
    {membres && <div style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 12 }}>Membres</h3>
      {membres.map(m => <div key={m.PERSON_KEY} style={{ padding: "5px 0",
        borderBottom: "1px solid var(--hair-soft)" }}>
        {[m.FIRST_NAME, m.LAST_NAME].filter(Boolean).join(" ")} — {m.EMAIL || "sans e-mail"}</div>)}
    </div>}
  </>);
}

export default function PageListes() {
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="listes" />
        <p style={{ color: "var(--ink-3)" }}>Une liste est figée : ce qu&apos;on y met y reste.
          Pour un ciblage vivant, utilisez un segment.</p>
        <Listes />
      </Coquille>
    </MandatFournisseur>
  );
}
