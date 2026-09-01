import Coquille from "@/components/Coquille";
import { MandatFournisseur } from "@/lib/mandat";

export default function Accueil() {
  return (
    <MandatFournisseur>
      <Coquille section="">
        <h1 style={{ fontSize: 22 }}>Tableau de bord</h1>
        <p style={{ color: "var(--ink-3)" }}>Arrive en tranche 2. La section Contacts est active.</p>
      </Coquille>
    </MandatFournisseur>
  );
}
