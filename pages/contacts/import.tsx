import { useState } from "react";
import { useSession } from "next-auth/react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import { MandatFournisseur } from "@/lib/mandat";

export default function PageImport() {
  const { data: session } = useSession();
  const admin = (session as never as { portee?: { role: string } })?.portee?.role === "admin";
  const [csv, setCsv] = useState("");
  const [resultat, setResultat] = useState<Record<string, number | boolean> | null>(null);

  async function lancer(applique: boolean) {
    const r = await fetch(`/capgrowth/api/import${applique ? "?applique=1" : ""}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }) });
    setResultat(await r.json());
  }
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="import" />
        {!admin ? <p><span className="pill warn">Import réservé à l&apos;administrateur : un fichier versé
          dans le référentiel partagé concerne tous les mandats.</span></p> : (<>
          <p style={{ color: "var(--ink-3)" }}>Colonnes : email (obligatoire), prenom, nom, titre,
            societe, telephone, linkedin, ville, pays. Une adresse déjà connue est ignorée —
            l&apos;import n&apos;écrase jamais l&apos;existant.</p>
          <textarea rows={10} style={{ width: "100%", fontFamily: "monospace" }}
            placeholder={"email,prenom,nom,societe\njane@acme.com,Jane,Doe,Acme"}
            value={csv} onChange={e => setCsv(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={() => lancer(false)}>Simuler</button>
            <button className="btn bleu" onClick={() => lancer(true)}
              disabled={!resultat || resultat["simulation"] !== true}>Importer</button>
          </div>
          {resultat && <pre style={{ background: "var(--bg-alt)", padding: 12, borderRadius: 10 }}>
            {JSON.stringify(resultat, null, 1)}</pre>}
        </>)}
      </Coquille>
    </MandatFournisseur>
  );
}
