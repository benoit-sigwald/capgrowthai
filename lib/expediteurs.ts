import { promises as dns } from "dns";
import { q } from "./oracle";

/*
 * Verification d'un domaine expediteur : SPF autorise Brevo, DKIM Brevo
 * resolu. Interrogation DNS reelle — jamais une declaration.
 *
 * Quand un enregistrement manque, on rend la ligne EXACTE a coller chez le
 * registrar : c'est ce qui a manque a chaque configuration faite a la main.
 */
export interface VerdictDomaine {
  domaine: string;
  spf_ok: boolean;
  dkim_ok: boolean;
  lignes_a_coller: { type: string; nom: string; valeur: string; motif: string }[];
}

export async function verifierDomaine(domaine: string): Promise<VerdictDomaine> {
  const lignes: VerdictDomaine["lignes_a_coller"] = [];

  let spf_ok = false;
  try {
    const txt = (await dns.resolveTxt(domaine)).map(t => t.join(""));
    const spf = txt.find(t => t.toLowerCase().startsWith("v=spf1"));
    spf_ok = !!spf && /include:spf\.brevo\.com/i.test(spf);
    if (!spf_ok) {
      lignes.push({
        type: "TXT", nom: "@",
        valeur: spf
          ? spf.replace(/\s*([~-]all|\?all|\+all)\s*$/i, " include:spf.brevo.com $1")
          : "v=spf1 include:spf.brevo.com -all",
        motif: spf
          ? "SPF present mais Brevo absent : MODIFIER la ligne existante (jamais en creer une seconde — deux SPF invalident tout)"
          : "aucun SPF : creer la ligne",
      });
    }
  } catch {
    lignes.push({ type: "TXT", nom: "@", valeur: "v=spf1 include:spf.brevo.com -all",
      motif: "le domaine ne repond pas en TXT" });
  }

  // Brevo publie deux selecteurs CNAME propres au compte.
  let dkim_ok = true;
  for (const sel of ["brevo1", "brevo2"]) {
    try {
      await dns.resolveCname(`${sel}._domainkey.${domaine}`);
    } catch {
      dkim_ok = false;
      lignes.push({
        type: "CNAME", nom: `${sel}._domainkey`,
        valeur: `b${sel.slice(-1)}.${domaine.replace(/\./g, "-")}.dkim.brevo.com`,
        motif: "selecteur DKIM Brevo absent (valeur exacte affichee dans Brevo > Domaines > Authentifier)",
      });
    }
  }

  return { domaine, spf_ok, dkim_ok, lignes_a_coller: lignes };
}

/* Monte les drapeaux en base et rend le verdict — rejouable a volonte. */
export async function verifierExpediteur(id: number) {
  const r = await q(`SELECT ID, CLIENT_ID, EMAIL, DOMAINE FROM EXPEDITEUR WHERE ID = :id`, { id });
  const e = (r.rows as { ID: number; CLIENT_ID: number; EMAIL: string; DOMAINE: string }[])[0];
  if (!e) return null;
  const v = await verifierDomaine(e.DOMAINE);
  await q(`UPDATE EXPEDITEUR SET SPF_OK = :s, DKIM_OK = :d,
             VERIFIE_LE = SYSTIMESTAMP WHERE ID = :id`,
          { s: v.spf_ok ? 1 : 0, d: v.dkim_ok ? 1 : 0, id });
  return { expediteur: e, ...v };
}
