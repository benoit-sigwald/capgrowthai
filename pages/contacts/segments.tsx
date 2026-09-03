import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import { MandatFournisseur, useMandat } from "@/lib/mandat";
import { nomLangue } from "@/components/TableContacts";

type Choix = { id: string; libelle: string; n: number };

/* Un menu deroulant a cocher, comme ailleurs dans l'outil. */
function Menu({ titre, ouvert, surOuvrir, surVider, children }: {
  titre: string; ouvert: boolean; surOuvrir: () => void;
  surVider?: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{ position: "relative" }}>
      <button className="btn" onClick={surOuvrir}>{titre}</button>
      {ouvert && (
        <div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, marginTop: 4,
          background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 12,
          boxShadow: "var(--shadow)", padding: 10, minWidth: 260, maxHeight: 320,
          overflowY: "auto" }}>
          {children}
          {surVider && (
            <button className="btn" style={{ width: "100%", marginTop: 8 }}
              onClick={surVider}>Tout décocher</button>)}
        </div>)}
    </div>);
}

function Case({ libelle, n, coche, surClic }: {
  libelle: string; n: number; coche: boolean; surClic: () => void;
}) {
  return (
    <label style={{ display: "flex", gap: 6, alignItems: "center", padding: "3px 0",
      fontSize: 11, cursor: "pointer" }}>
      <input type="checkbox" checked={coche} onChange={surClic} />
      <span style={{ flex: 1 }}>{libelle}</span>
      <span style={{ color: "var(--ink-3)" }}>{n.toLocaleString("fr-FR")}</span>
    </label>);
}

function Segments() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [nom, setNom] = useState("");
  const [filtre, setFiltre] = useState({ source: "investors", canal: "email",
    pays: "", langues: "", secteur: "" });
  const [paysDispo, setPaysDispo] = useState<{ VALEUR: string; N: number }[]>([]);
  const [secteurs, setSecteurs] = useState<{ familles: Choix[]; autres: Choix[] }>(
    { familles: [], autres: [] });
  const [ouvert, setOuvert] = useState<"" | "pays" | "secteur">("");
  const [chercheSecteur, setChercheSecteur] = useState("");
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
      <Menu titre={listeDe("pays").length
              ? `Pays : ${listeDe("pays").join(", ")}` : "Tous les pays"}
        ouvert={ouvert === "pays"} surOuvrir={() => setOuvert(ouvert === "pays" ? "" : "pays")}
        surVider={listeDe("pays").length ? () => setFiltre({ ...filtre, pays: "" }) : undefined}>
        {paysDispo.map(p => (
          <Case key={p.VALEUR} libelle={p.VALEUR} n={p.N}
            coche={listeDe("pays").includes(p.VALEUR)}
            surClic={() => basculer("pays", p.VALEUR)} />))}
      </Menu>

      <Menu titre={listeDe("secteur").length
              ? `Type : ${listeDe("secteur").length} coché(s)` : "Tous les types d'entreprise"}
        ouvert={ouvert === "secteur"}
        surOuvrir={() => setOuvert(ouvert === "secteur" ? "" : "secteur")}
        surVider={listeDe("secteur").length ? () => setFiltre({ ...filtre, secteur: "" }) : undefined}>
        {secteurs.familles.map(f => (
          <Case key={f.id} libelle={f.libelle} n={f.n} coche={listeDe("secteur").includes(f.id)}
            surClic={() => basculer("secteur", f.id)} />))}
        {secteurs.autres.length > 0 && (<>
          <div style={{ borderTop: "1px solid var(--hair-soft)", margin: "8px 0 6px",
            paddingTop: 6, fontSize: 10, color: "var(--ink-3)" }}>
            Autres activités ({secteurs.autres.length})</div>
          <input placeholder="chercher une activité…" value={chercheSecteur}
            onChange={e => setChercheSecteur(e.target.value)}
            style={{ width: "100%", marginBottom: 6 }} />
          {secteurs.autres
            .filter(a => !chercheSecteur
              || a.libelle.toLowerCase().includes(chercheSecteur.toLowerCase()))
            .slice(0, 40)
            .map(a => (
              <Case key={a.id} libelle={a.libelle} n={a.n}
                coche={listeDe("secteur").includes(a.id)}
                surClic={() => basculer("secteur", a.id)} />))}
        </>)}
      </Menu>
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
