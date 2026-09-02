import Link from "next/link";
import { signOut } from "next-auth/react";
import { useMandat } from "@/lib/mandat";

/*
 * La navigation entiere, dans l'ordre de Brevo. Les sections a venir sont
 * grisees avec leur tranche ; les canaux non praticables portent leur motif.
 * Jamais de trompe-l'oeil : un menu qui promet un canal inaccessible fait
 * perdre plus de temps qu'il n'en fait gagner.
 */
type Section = { id: string; libelle: string;
                 etat: "actif" | "a_venir" | "indisponible"; motif?: string };

const SECTIONS: Section[] = [
  { id: "", libelle: "Tableau de bord", etat: "actif" },
  { id: "contacts", libelle: "Contacts", etat: "actif" },
  { id: "campagnes", libelle: "Campagnes", etat: "actif" },
  { id: "reponses", libelle: "E-mails", etat: "actif" },
  { id: "modeles", libelle: "Modèles", etat: "actif" },
  { id: "statistiques", libelle: "Statistiques", etat: "actif" },
  { id: "transactionnel", libelle: "Transactionnel", etat: "actif" },
  { id: "sms", libelle: "SMS", etat: "indisponible", motif: "Aucun crédit SMS Brevo" },
  { id: "whatsapp", libelle: "WhatsApp", etat: "indisponible", motif: "Pas de compte WhatsApp Business" },
  { id: "conversations", libelle: "Conversations", etat: "indisponible", motif: "Aucun widget de chat installé" },
  { id: "parametres", libelle: "Paramètres", etat: "actif" },
];

/*
 * En chantier.
 *
 * Ces ecrans fonctionnent mais ne sont pas arretes : les regrouper en bas
 * evite qu'on s'appuie dessus comme sur le reste. Un menu qui melange l'acquis
 * et le provisoire ne dit plus lequel est lequel.
 */
const CHANTIER: Section[] = [
  { id: "automatisation", libelle: "Automatisation", etat: "actif" },
  { id: "crm", libelle: "CRM", etat: "actif" },
];

function lien(s: Section, section: string) {
  return s.etat === "actif" ? (
    <Link key={s.id} href={`/${s.id}`} style={{
      padding: "8px 10px", borderRadius: 10, color: "inherit",
      background: section === s.id ? "var(--card)" : "transparent",
      fontWeight: section === s.id ? 600 : 400 }}>{s.libelle}</Link>
  ) : (
    <span key={s.id} title={s.motif} style={{ padding: "8px 10px",
      color: "var(--ink-3)", cursor: "not-allowed" }}>
      {s.libelle} <small style={{ fontSize: 9 }}>
        {s.etat === "indisponible" ? "—" : "bientôt"}</small>
    </span>
  );
}

export default function Coquille({ section, children }: { section: string; children: React.ReactNode }) {
  const { mandat, mandats, choisir } = useMandat();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", minHeight: "100vh" }}>
      <aside style={{ background: "var(--bg-alt)", borderRight: "1px solid var(--hair-soft)",
        padding: "18px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 15, padding: "4px 10px 12px" }}>CapGrowthAI</div>
        <select value={mandat?.ID ?? ""} title="Mandat actif — porte le cloisonnement"
          onChange={e => { const m = mandats.find(x => x.ID === Number(e.target.value)); if (m) choisir(m); }}
          style={{ marginBottom: 14 }}>
          {mandats.map(m => <option key={m.ID} value={m.ID}>{m.NOM}</option>)}
        </select>
        {SECTIONS.map(s => lien(s, section))}

        {/* Replie par defaut, sauf si l'on s'y trouve : un chantier ne
            s'impose pas dans le menu, mais on ne perd pas de vue ou l'on est. */}
        <details open={CHANTIER.some(s => s.id === section)} style={{ marginTop: 14 }}>
          <summary style={{ cursor: "pointer", padding: "6px 10px", fontSize: 10,
            letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)",
            listStyle: "revert" }}>WIP</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            {CHANTIER.map(s => lien(s, section))}
          </div>
        </details>

        <button className="btn" style={{ marginTop: "auto" }}
          onClick={() => signOut({ callbackUrl: "/capgrowth/connexion" })}>Se déconnecter</button>
      </aside>
      <main style={{ padding: "26px 32px", minWidth: 0 }}>{children}</main>
    </div>
  );
}
