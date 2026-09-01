/*
 * Client HTTP du moteur d'envoi (arx-mailer, reseau docker interne).
 *
 * L'envoi ne change pas de main : la cle Brevo, les paliers de chauffage et
 * les exclusions vivent dans le mailer. Le CRM le pilote et relaie ses
 * reponses telles quelles — il n'invente aucun compteur.
 */
const BASE = process.env.MAILER_BASE || "http://arx-mailer:8080";
const SECRET = process.env.MAILER_SECRET || "";

export async function appelMailer(chemin: string, corps?: unknown, methode = "POST") {
  const r = await fetch(BASE + chemin, {
    method: corps === undefined ? (methode === "POST" ? "GET" : methode) : methode,
    headers: {
      "x-mailer-secret": SECRET,
      ...(corps !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: corps !== undefined ? JSON.stringify(corps) : undefined,
  });
  const texte = await r.text();
  let json: unknown;
  try { json = JSON.parse(texte); } catch { json = { brut: texte.slice(0, 300) }; }
  if (!r.ok) throw new Error((json as { erreur?: string }).erreur || `mailer ${r.status}`);
  return json as Record<string, unknown>;
}

export const chauffage = (sender: string) =>
  appelMailer(`/chauffage?sender=${encodeURIComponent(sender)}`);
export const sendersBrevo = () => appelMailer("/senders");
export const creerSenderBrevo = (email: string, name: string) =>
  appelMailer("/senders", { email, name });
export const preparer = (corps: Record<string, unknown>) => appelMailer("/prepare", corps);
export const envoyerLot = (campaign_id: string, batch: number) =>
  appelMailer("/send", { campaign_id, batch });
