import { type AppType } from "next/app";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { setUser } from "@sentry/nextjs";
import { useSession } from "next-auth/react";

import { api } from "@/src/utils/api";

import "@/src/styles/globals.css";
import Layout from "@/src/components/layouts/layout";
import { useEffect } from "react";

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={true}>
      <Layout>
        <Component {...pageProps} />
        <SentryUserManager />
      </Layout>
    </SessionProvider>
  );
};

export default api.withTRPC(MyApp);

function SentryUserManager() {
  const session = useSession();

  useEffect(() => {
    if (session.status === "authenticated" && session.data) {
      setUser({
        email: session.data.user?.email ?? undefined,
        id: session.data.user?.id ?? undefined,
      });
    } else {
      setUser(null);
    }
  }, [session]);
  return null;
}
