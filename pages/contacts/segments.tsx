import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import { MandatFournisseur, useMandat } from "@/lib/mandat";
import { nomLangue } from "@/components/TableContacts";
import MenuCases, { type Choix } from "@/components/MenuCases";

function Segments() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [nom, setNom] = useState("");
  const [filtre, setFiltre] = useState({ source: "investors", canal: "email",
    pays: "", langues: "", secteur: "" });
  const [paysDispo, setPaysDispo] = useState<{ VALEUR: string; N: number }[]>([]);
  const [secteurs, setSecteurs] = useState<{ familles: Required<Choix>[]; autres: Required<Choix>[] }>(
    { familles: [], autres: [] });
  const [languesDispo, setLanguesDispo] = useState<{ LANGUE: string; N: number }[]>([]);
  useEffect(() => {
    fetch("/capgrowth/api/langues").then(r => r.json())
      .then(d => setLanguesDispo(d.rows || [])).catch(() => {});
    fetch("/capgrowth/api/valeurs?champ=pays").then(r => r.json())
      .then(d => setPaysDispo(d.rows || [])).catch(() => {});
    fetch("/capgrowth/api/valeurs?champ=secteur").then(r => r.json())
      .then(d => setSecteurs({ familles: d.familles || [], autres: d.autres || [] }))
      .catch(() => {});
  }, []);

  /* Cocher, decocher : la valeur reste une chaine a virgules, comme ailleurs. */
  const listeDe = (champ: "pays" | "secteur") =>
    filtre[champ].split(",").map(x => x.trim()).filter(Boolean);
  const basculer = (champ: "pays" | "secteur", id: string) => {
    const actuel = listeDe(champ);
    const suite = actuel.includes(id) ? actuel.filter(x => x !== id) : [...actuel, id];
    setFiltre({ ...filtre, [champ]: suite.join(",") });
  };
  const choisies = filtre.langues ? filtre.langues.split(",").filter(Boolean) : [];
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
      {/* Pays et type d'entreprise : a cocher, avec le nombre de fiches que
          chaque case represente. Un filtre sans compteur oblige a essayer pour
          savoir ce qu'il vaut. */}
      <MenuCases titre={listeDe("pays").length
          ? `Pays : ${listeDe("pays").join(", ")}` : "Tous les pays"}
        choix={paysDispo.map(p => ({ id: p.VALEUR, libelle: p.VALEUR, n: p.N }))}
        valeurs={listeDe("pays")}
        surChange={v => setFiltre({ ...filtre, pays: v.join(",") })} />

      <MenuCases titre={listeDe("secteur").length
          ? `Type : ${listeDe("secteur").length} coché(s)` : "Tous les types d'entreprise"}
        choix={[...secteurs.familles, ...secteurs.autres]
          .map(x => ({ id: x.id, libelle: x.libelle, n: x.n }))}
        valeurs={listeDe("secteur")} recherche
        surChange={v => setFiltre({ ...filtre, secteur: v.join(",") })} />

      <button className="btn bleu" onClick={creer}>Enregistrer le segment</button>
    </div>
    {/* La langue decide du gabarit qui partira : c'est le critere de segment
        le plus utile apres le canal. */}
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
      <span style={{ fontSize: 11, color: "var(--ink-3)", alignSelf: "center" }}>Langues :</span>
      {languesDispo.slice(0, 12).map(l => (
        <button key={l.LANGUE}
          className="chip btn"
          style={{ padding: "4px 12px",
            background: choisies.includes(l.LANGUE) ? "var(--blue)" : "var(--card)",
            borderColor: choisies.includes(l.LANGUE) ? "var(--blue)" : "var(--hair)",
            color: choisies.includes(l.LANGUE) ? "#fff" : "var(--ink-2)" }}
          onClick={() => {
            const n = choisies.includes(l.LANGUE)
              ? choisies.filter(c => c !== l.LANGUE) : [...choisies, l.LANGUE];
            setFiltre({ ...filtre, langues: n.join(",") });
          }}>{nomLangue(l.LANGUE)} <span style={{ opacity: .7 }}>{l.N}</span></button>))}
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
