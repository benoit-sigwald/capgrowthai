import { withAuth } from "next-auth/middleware";

// Tout est prive sauf la connexion, la sante et la mecanique next-auth.
export default withAuth({ pages: { signIn: "/connexion" } });
export const config = {
  matcher: ["/((?!api/auth|api/sante|connexion|_next|favicon.ico).*)"],
};
