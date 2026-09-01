import { useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import { MandatFournisseur } from "@/lib/mandat";
import { nomBase } from "@/components/TableContacts";

export default function PageDesinscrits() {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  useEffect(() => {
    fetch("/capgrowth/api/desinscrits").then(r => r.json()).then(d => setRows(d.rows || []));
  }, []);
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="desinscrits" />
        <p style={{ color: "var(--ink-3)" }}>Personnes à qui l&apos;on n&apos;écrit plus. Lecture seule —
          un refus se respecte, il ne s&apos;édite pas.</p>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <tbody>{rows.map(r => (
            <tr key={r.PERSON_KEY} style={{ borderBottom: "1px solid var(--hair-soft)" }}>
              <td style={{ padding: "7px 12px", fontWeight: 600 }}>
                {[r.FIRST_NAME, r.LAST_NAME].filter(Boolean).join(" ")}</td>
              <td style={{ padding: "7px 12px" }}>{r.EMAIL || "—"}</td>
              <td style={{ padding: "7px 12px" }}>{r.COMPANY || "—"}</td>
              <td style={{ padding: "7px 12px" }}><span className="pill">{nomBase(r.SOURCE)}</span></td>
            </tr>))}
          </tbody>
        </table>
      </Coquille>
    </MandatFournisseur>
  );
}
