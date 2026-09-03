import { useState } from "react";

export type Choix = { id: string; libelle: string; n?: number };

/*
 * Un menu deroulant a cocher, avec le nombre de fiches derriere chaque case.
 *
 * Il en existait cinq copies : bases, canaux, langues, pays, type d'entreprise.
 * Cinq fois le meme bloc de style, et cinq endroits ou corriger le jour ou l'un
 * d'eux se comporte mal. Le compteur n'est pas decoratif : sans lui, on coche
 * pour voir, on regarde, on decoche.
 */
export default function MenuCases({ titre, choix, valeurs, surChange,
                                    recherche, pied }: {
  titre: string;
  choix: Choix[];
  /** Les identifiants coches, dans l'ordre ou l'utilisateur les a cochés. */
  valeurs: string[];
  surChange: (valeurs: string[]) => void;
  /** Au-dela d'une vingtaine de cases, on cherche plutot qu'on ne parcourt. */
  recherche?: boolean;
  pied?: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState("");

  const basculer = (id: string) => surChange(
    valeurs.includes(id) ? valeurs.filter(v => v !== id) : [...valeurs, id]);

  const visibles = q
    ? choix.filter(c => c.libelle.toLowerCase().includes(q.toLowerCase()))
    : choix;

  return (
    <div style={{ position: "relative" }}>
      <button className="btn" onClick={() => setOuvert(o => !o)}>{titre}</button>
      {ouvert && (
        <div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, marginTop: 4,
          background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 12,
          boxShadow: "var(--shadow)", padding: 10, minWidth: 240, maxHeight: 320,
          overflowY: "auto" }}>
          {recherche && (
            <input placeholder="chercher…" value={q} onChange={e => setQ(e.target.value)}
              style={{ width: "100%", marginBottom: 8 }} />)}
          {visibles.slice(0, 60).map(c => (
            <label key={c.id} style={{ display: "flex", gap: 6, alignItems: "center",
              padding: "3px 0", fontSize: 11, cursor: "pointer" }}>
              <input type="checkbox" checked={valeurs.includes(c.id)}
                onChange={() => basculer(c.id)} />
              <span style={{ flex: 1 }}>{c.libelle}</span>
              {c.n !== undefined && <span style={{ color: "var(--ink-3)" }}>
                {c.n.toLocaleString("fr-FR")}</span>}
            </label>))}
          {!visibles.length && <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
            Aucune valeur.</span>}
          {visibles.length > 60 && <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
            {visibles.length - 60} de plus — affinez la recherche.</span>}
          {pied}
          {valeurs.length > 0 && (
            <button className="btn" style={{ width: "100%", marginTop: 8 }}
              onClick={() => surChange([])}>Tout décocher</button>)}
        </div>)}
    </div>);
}
