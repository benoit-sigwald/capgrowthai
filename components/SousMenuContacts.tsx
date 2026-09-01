import Link from "next/link";

const ONGLETS = [
  ["", "Tous les contacts"], ["segments", "Segments"], ["listes", "Listes"],
  ["attributs", "Attributs"], ["import", "Import"], ["desinscrits", "Désinscrits"],
] as const;

export default function SousMenuContacts({ actif }: { actif: string }) {
  return (
    <nav style={{ display: "flex", gap: 18, borderBottom: "1px solid var(--hair-soft)", marginBottom: 18 }}>
      {ONGLETS.map(([id, lib]) => (
        <Link key={id} href={`/contacts/${id}`} style={{
          padding: "8px 2px", color: actif === id ? "var(--ink)" : "var(--ink-2)",
          borderBottom: actif === id ? "2px solid var(--ink)" : "2px solid transparent",
          fontWeight: actif === id ? 600 : 400 }}>{lib}</Link>
      ))}
    </nav>
  );
}
