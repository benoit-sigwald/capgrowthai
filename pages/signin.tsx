import type { GetServerSidePropsContext } from "next";

/*
 * Filet de securite.
 *
 * next-auth ramene ici de lui-meme quand un jeton CSRF ne correspond plus
 * (« /signin?csrf=true »), sans tenir compte de la page de connexion declaree
 * dans authOptions. Cette page n'existait pas : l'utilisateur tombait sur un
 * 404 nu, sans savoir que sa seule faute etait un onglet reste ouvert trop
 * longtemps. On le ramene sur la connexion, en le disant.
 */
export default function Signin() { return null; }

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const perime = ctx.query.csrf ? "?expire=1" : "";
  return { redirect: { destination: `/connexion${perime}`, permanent: false } };
}
