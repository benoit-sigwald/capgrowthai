import { useCallback, useEffect, useState } from "react";
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
  // « tout le filtre » : on ne garde pas 3 879 clés en mémoire, on garde le
  // critère. C'est le serveur qui le rejouera au moment de l'ajout.
  const [toutLeFiltre, setToutLeFiltre] = useState(false);
  const [filtre, setFiltre] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);

  const surFiltre = useCallback((f: Record<string, string>, n: number) => {
    setFiltre(f); setTotal(n);
    // Changer de filtre annule une sélection globale : elle ne désignerait
    // plus les mêmes personnes.
    setToutLeFiltre(false);
  }, []);

  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="" />
        {(selection.size > 0 || toutLeFiltre) && (
          <BarreSelection selection={selection} toutLeFiltre={toutLeFiltre} filtre={filtre}
            total={total} surToutLeFiltre={setToutLeFiltre}
            surVide={() => { setSelection(new Set()); setToutLeFiltre(false); }} />)}
        <TableContacts key={version} onOuvrir={setOuvert} selection={selection}
          surFiltre={surFiltre}
          surSelection={(k, coche) => setSelection(s => {
            const n = new Set(s); if (coche) n.add(k); else n.delete(k);
            if (!coche) setToutLeFiltre(false);
            return n; })}
          surPage={(cles, coche) => setSelection(s => {
            const n = new Set(s);
            cles.forEach(k => coche ? n.add(k) : n.delete(k));
            if (!coche) setToutLeFiltre(false);
            return n; })} />
        {ouvert && <FichePersonne personKey={ouvert.PERSON_KEY} admin={admin}
          onFermer={() => setOuvert(null)} onChange={() => setVersion(v => v + 1)} />}
      </Coquille>
    </MandatFournisseur>
  );
}

function BarreSelection({ selection, toutLeFiltre, filtre, total, surToutLeFiltre, surVide }: {
  selection: Set<string>; toutLeFiltre: boolean; filtre: Record<string, string>;
  total: number; surToutLeFiltre: (v: boolean) => void; surVide: () => void;
}) {
  const { mandat } = useMandat();
  const [listes, setListes] = useState<{ ID: number; NOM: string }[]>([]);
  const [cible, setCible] = useState(0);
  const [nouvelle, setNouvelle] = useState("");
  const [msg, setMsg] = useState("");

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/listes?client=${mandat.ID}`).then(r => r.json())
      .then(d => setListes(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);

  async function ajouter() {
    if (!mandat) return;
    let id = cible;
    // Créer la liste à la volée si on a saisi un nom : évite l'aller-retour
    // par l'onglet Listes pour un geste qu'on veut faire ici.
    if (!id && nouvelle.trim()) {
      const c = await fetch(`/capgrowth/api/listes?client=${mandat.ID}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: mandat.ID, nom: nouvelle.trim() }) });
      if (!c.ok) { setMsg((await c.json()).erreur); return; }
      const d = await (await fetch(`/capgrowth/api/listes?client=${mandat.ID}`)).json();
      id = (d.rows as { ID: number; NOM: string }[]).find(l => l.NOM === nouvelle.trim())?.ID ?? 0;
      setListes(d.rows || []);
    }
    if (!id) { setMsg("Choisissez une liste ou donnez un nom."); return; }

    setMsg("Ajout…");
    const corps = toutLeFiltre ? { filtre } : { person_keys: [...selection] };
    const r = await fetch(`/capgrowth/api/listes/${id}`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    setMsg(`${j.ajoutes} ajouté(s)${j.demandes > j.ajoutes
      ? ` — ${j.demandes - j.ajoutes} déjà dans la liste` : ""}. La liste en compte ${j.total}.`
      + (j.plafond_atteint ? " Plafond de 5 000 atteint : affinez le filtre." : ""));
    setNouvelle(""); charger();
    setTimeout(surVide, 2600);
  }

  const compte = toutLeFiltre ? total : selection.size;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap",
      background: "var(--bg-alt)", borderRadius: 12, padding: "10px 14px" }}>
      <b>{compte.toLocaleString("fr-FR")} sélectionné{compte > 1 ? "s" : ""}</b>
      {!toutLeFiltre && total > selection.size && (
        <button className="btn" onClick={() => surToutLeFiltre(true)}>
          Sélectionner les {total.toLocaleString("fr-FR")} du filtre
        </button>)}
      <select value={cible} onChange={e => setCible(Number(e.target.value))}>
        <option value={0}>Ajouter à une liste…</option>
        {listes.map(l => <option key={l.ID} value={l.ID}>{l.NOM}</option>)}
      </select>
      {!cible && <input placeholder="…ou nouvelle liste" value={nouvelle} style={{ width: 170 }}
        onChange={e => setNouvelle(e.target.value)} />}
      <button className="btn bleu" onClick={ajouter}>Ajouter</button>
      <button className="btn" onClick={surVide}>Annuler</button>
      {msg && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{msg}</span>}
    </div>
  );
}
