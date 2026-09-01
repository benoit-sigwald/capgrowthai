/*
 * La portee d'un utilisateur : qui il est, ce qu'il a le droit de voir.
 *
 * Toute API scoped passe par ici. C'est la couche que l'ecran ne peut pas
 * contourner : le filtre par mandat est decide dans le serveur, jamais dans
 * une requete construite cote navigateur.
 */
export type Role = "admin" | "membre" | "client";
export interface Portee { uid: number; role: Role; clientIds: number[] }

export function clientAutorise(p: Portee, clientId: number): boolean {
  if (p.role === "admin") return true;
  return p.clientIds.includes(clientId);
}

// Le referentiel (85 494 personnes) est l'actif d'Arx, pas celui d'un mandat.
export function contactsAutorises(p: Portee): boolean {
  return p.role !== "client";
}

export function exigerAdmin(p: Portee): boolean {
  return p.role === "admin";
}
