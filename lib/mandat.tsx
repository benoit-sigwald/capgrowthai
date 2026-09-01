import { createContext, useContext, useEffect, useState } from "react";

type Mandat = { ID: number; NOM: string; MODE_EXPEDITEUR: string };
type Ctx = { mandat: Mandat | null; mandats: Mandat[]; role: string; choisir: (m: Mandat) => void };
const MandatCtx = createContext<Ctx>({ mandat: null, mandats: [], role: "", choisir: () => {} });

export function MandatFournisseur({ children }: { children: React.ReactNode }) {
  const [mandats, setMandats] = useState<Mandat[]>([]);
  const [role, setRole] = useState("");
  const [mandat, setMandat] = useState<Mandat | null>(null);

  useEffect(() => {
    fetch("/capgrowth/api/mes-mandats").then(r => r.json()).then(d => {
      setMandats(d.mandats || []); setRole(d.role || "");
      // Le dernier mandat choisi est un confort local, jamais une verite.
      let voulu: Mandat | undefined;
      try { const id = Number(localStorage.getItem("mandat")); voulu = d.mandats.find((m: Mandat) => m.ID === id); } catch {}
      setMandat(voulu ?? d.mandats[0] ?? null);
    }).catch(() => {});
  }, []);

  const choisir = (m: Mandat) => { setMandat(m); try { localStorage.setItem("mandat", String(m.ID)); } catch {} };
  return <MandatCtx.Provider value={{ mandat, mandats, role, choisir }}>{children}</MandatCtx.Provider>;
}
export const useMandat = () => useContext(MandatCtx);
