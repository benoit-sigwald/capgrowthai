import type { AppProps } from "next/app";
import { SessionProvider } from "next-auth/react";
import "@/styles/global.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SessionProvider session={pageProps.session} basePath="/capgrowth/api/auth">
      <Component {...pageProps} />
    </SessionProvider>
  );
}
