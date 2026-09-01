import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { q } from "./oracle";
import type { Portee, Role } from "./portee";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/connexion" },
  providers: [
    CredentialsProvider({
      name: "Identifiants",
      credentials: { email: { type: "text" }, motdepasse: { type: "password" } },
      async authorize(cred) {
        if (!cred?.email || !cred?.motdepasse) return null;
        const r = await q(
          `SELECT ID, EMAIL, NOM, HASH, ROLE FROM UTILISATEUR
            WHERE LOWER(EMAIL) = LOWER(:e) AND ACTIF = 1`, { e: cred.email });
        const u = r.rows?.[0] as { ID: number; EMAIL: string; NOM: string; HASH: string; ROLE: Role } | undefined;
        if (!u || !bcrypt.compareSync(cred.motdepasse, u.HASH)) return null;
        // Les affectations entrent dans le jeton a la connexion. Une nouvelle
        // affectation prend effet a la reconnexion — compromis assume en v1.
        const a = await q(`SELECT CLIENT_ID, ROLE FROM AFFECTATION WHERE UTILISATEUR_ID = :id`,
                          { id: u.ID });
        const lignes = a.rows as { CLIENT_ID: number; ROLE: "membre" | "client" }[];
        const clientIds = lignes.map(x => x.CLIENT_ID);
        const droits = Object.fromEntries(lignes.map(x => [x.CLIENT_ID, x.ROLE]));
        return { id: String(u.ID), email: u.EMAIL, name: u.NOM,
                 role: u.ROLE, clientIds, droits } as never;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) { const u = user as never as
          { role: Role; clientIds: number[]; droits: Record<number, "membre" | "client"> };
        token.role = u.role; token.clientIds = u.clientIds; token.droits = u.droits; }
      return token;
    },
    session({ session, token }) {
      (session as never as { portee: Portee }).portee = {
        uid: Number(token.sub), role: token.role as Role,
        clientIds: (token.clientIds as number[]) || [],
        droits: (token.droits as Record<number, "membre" | "client">) || {},
      };
      return session;
    },
  },
};

export async function porteeDepuis(req: NextApiRequest, res: NextApiResponse): Promise<Portee | null> {
  const s = await getServerSession(req, res, authOptions);
  return (s as never as { portee?: Portee })?.portee ?? null;
}
