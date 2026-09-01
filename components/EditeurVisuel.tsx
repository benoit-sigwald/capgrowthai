import { useCallback, useEffect, useRef } from "react";

/*
 * Editeur visuel d'un gabarit d'e-mail.
 *
 * On edite le message TEL QU'IL SERA RECU, pas son code : celui qui ecrit a
 * des investisseurs n'a pas a lire du HTML pour corriger un chiffre. La zone
 * d'edition est le rendu lui-meme, et le HTML se met a jour dessous.
 *
 * Pourquoi un cadre isole (iframe) plutot qu'une zone modifiable ordinaire :
 * un gabarit d'e-mail porte ses propres styles, souvent des tableaux et des
 * regles qui s'appliqueraient a toute l'application s'ils partageaient la meme
 * page. Le cadre les enferme.
 *
 * `sandbox="allow-same-origin"` sans `allow-scripts` : on garde l'acces au
 * document pour l'editer, les scripts eventuels du gabarit ne s'executent pas.
 */
export default function EditeurVisuel({ html, surChange, cle }: {
  html: string;
  surChange: (html: string) => void;
  /** Change quand on ouvre un AUTRE gabarit : c'est le seul moment ou l'on
   *  reinjecte le contenu. Le reinjecter a chaque frappe replacerait le
   *  curseur au debut du document. */
  cle: string;
}) {
  const cadre = useRef<HTMLIFrameElement | null>(null);
  const dernier = useRef<string>(html);

  const preparer = useCallback(() => {
    const doc = cadre.current?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html || "<p></p>");
    doc.close();
    doc.designMode = "on";
    const relever = () => {
      const sortie = "<!doctype html>" + doc.documentElement.outerHTML;
      dernier.current = sortie;
      surChange(sortie);
    };
    doc.addEventListener("input", relever);
    doc.addEventListener("blur", relever, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  useEffect(preparer, [preparer]);

  /* execCommand est officiellement deprecie et reste la seule facon
   * universellement supportee de mettre en gras une selection dans un document
   * editable. On s'en tient a trois actions : au-dela, un editeur riche
   * fabriquerait du HTML que les clients de messagerie rendent mal. */
  const agir = (commande: string, valeur?: string) => {
    const doc = cadre.current?.contentDocument;
    if (!doc) return;
    doc.execCommand(commande, false, valeur);
    const sortie = "<!doctype html>" + doc.documentElement.outerHTML;
    dernier.current = sortie;
    surChange(sortie);
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" onClick={() => agir("bold")} title="Gras"><b>G</b></button>
        <button className="btn" onClick={() => agir("italic")} title="Italique"><i>I</i></button>
        <button className="btn" onClick={() => {
          const url = prompt("Adresse du lien (laisser vide pour retirer le lien)");
          if (url === null) return;
          agir(url ? "createLink" : "unlink", url || undefined);
        }}>Lien</button>
        <button className="btn" onClick={() => agir("undo")}>Annuler</button>
        <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
          Cliquez dans le message et écrivez. Les <code>{"{{variables}}"}</code> se remplacent
          à l&apos;envoi : laissez-les telles quelles.
        </span>
      </div>
      <iframe ref={cadre} title="Édition du message" sandbox="allow-same-origin"
        onLoad={preparer}
        style={{ width: "100%", height: "58vh", border: "1px solid var(--hair)",
          borderRadius: 10, background: "#fff" }} />
    </div>
  );
}
