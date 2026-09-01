/*
 * La portee d'un utilisateur : qui il est, ce qu'il a le droit de voir.
 *
 * Toute API scoped passe par ici. C'est la couche que l'ecran ne peut pas
 * contourner : le filtre par mandat est decide dans le serveur, jamais dans
 * une requete construite cote navigateur.
 */
export type Role = "admin" | "membre" | "client";

/*
 * `droits` porte le role MANDAT PAR MANDAT : quelqu'un peut travailler le
 * referentiel sur l'un et n'avoir qu'un droit de lecture sur l'autre. Un role
 * global unique etait trop grossier pour dire cela.
 *
 * `role` ne garde qu'une chose : administrateur, ou non.
 */
export interface Portee {
  uid: number; role: Role; clientIds: number[];
  droits?: Record<number, "membre" | "client">;
}

export function clientAutorise(p: Portee, clientId: number): boolean {
  if (p.role === "admin") return true;
  return p.clientIds.includes(clientId);
}

/* Le droit exact sur un mandat donne. */
export function droitSur(p: Portee, clientId: number): Role | null {
  if (p.role === "admin") return "admin";
  if (!p.clientIds.includes(clientId)) return null;
  return p.droits?.[clientId] ?? "membre";
}

/*
 * Le referentiel (85 494 personnes) est l'actif d'Arx, pas celui d'un mandat :
 * il suffit d'etre « membre » quelque part pour y acceder. Quelqu'un qui n'est
 * « client » que partout n'y entre jamais.
 */
export function contactsAutorises(p: Portee): boolean {
  if (p.role === "admin") return true;
  const d = p.droits;
  if (!d || !Object.keys(d).length) return p.role !== "client";
  return Object.values(d).some(r => r === "membre");
}

export function exigerAdmin(p: Portee): boolean {
  return p.role === "admin";
}
