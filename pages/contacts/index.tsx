import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import TableContacts, { Personne } from "@/components/TableContacts";
import FichePersonne from "@/components/FichePersonne";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

export default function PageContacts() {
  const { data: session } = useSession();
  const admin = (session as never as { portee?: { role: string } })?.portee?.role === "admin";
  const [ouvert, setOuvert] = useState<Personne | null>(null);
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="" />
        {selection.size > 0 && <BarreSelection selection={selection} surVide={() => setSelection(new Set())} />}
        <TableContacts key={version} onOuvrir={setOuvert} selection={selection}
          surSelection={(k, coche) => setSelection(s => {
            const n = new Set(s); if (coche) n.add(k); else n.delete(k); return n; })} />
        {ouvert && <FichePersonne personKey={ouvert.PERSON_KEY} admin={admin}
          onFermer={() => setOuvert(null)} onChange={() => setVersion(v => v + 1)} />}
      </Coquille>
    </MandatFournisseur>
  );
}

function BarreSelection({ selection, surVide }: { selection: Set<string>; surVide: () => void }) {
  const { mandat } = useMandat();
  const [listes, setListes] = useState<{ ID: number; NOM: string }[]>([]);
  const [cible, setCible] = useState(0);
  useEffect(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/listes?client=${mandat.ID}`).then(r => r.json())
      .then(d => setListes(d.rows || []));
  }, [mandat]);
  async function ajouter() {
    if (!cible) return;
    await fetch(`/capgrowth/api/listes/${cible}`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person_keys: [...selection] }) });
    surVide();
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10,
      background: "var(--bg-alt)", borderRadius: 12, padding: "8px 12px" }}>
      <b>{selection.size} sélectionné(s)</b>
      <select value={cible} onChange={e => setCible(Number(e.target.value))}>
        <option value={0}>Ajouter à une liste…</option>
        {listes.map(l => <option key={l.ID} value={l.ID}>{l.NOM}</option>)}
      </select>
      <button className="btn bleu" onClick={ajouter}>Ajouter</button>
      <button className="btn" onClick={surVide}>Annuler</button>
    </div>
  );
}
