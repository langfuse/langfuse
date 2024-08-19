import { type AppType } from "next/app";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { setUser } from "@sentry/nextjs";
import { useSession } from "next-auth/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";

import { api } from "@/src/utils/api";

import NextAdapterPages from "next-query-params/pages";
import { QueryParamProvider } from "use-query-params";

import "@/src/styles/globals.css";
import Layout from "@/src/components/layouts/layout";
import { useEffect } from "react";
import { useRouter } from "next/router";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { CrispWidget, chatSetUser } from "@/src/features/support-chat";
import prexit from "prexit";

// Custom polyfills not yet available in `next-core`:
// https://github.com/vercel/next.js/issues/58242
// https://nextjs.org/docs/architecture/supported-browsers#custom-polyfills
import "core-js/features/array/to-reversed";
import "core-js/features/array/to-spliced";
import "core-js/features/array/to-sorted";

// Other CSS
import "react18-json-view/src/style.css";
import { DetailPageListsProvider } from "@/src/features/navigate-detail-pages/context";
import { env } from "@/src/env.mjs";
import { ThemeProvider } from "@/src/features/theming/ThemeProvider";
import { shutdown } from "@/src/utils/shutdown";
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";

const setProjectInPosthog = () => {
  // project
  const url = window.location.href;
  const regex = /\/project\/([^\/]+)/;
  const match = url.match(regex);
  if (match && match[1]) {
    posthog.group("project", match[1]);
  } else {
    posthog.resetGroups();
  }
};

// Check that PostHog is client-side (used to handle Next.js SSR) and that env vars are set
if (
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_POSTHOG_KEY &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST
) {
  setProjectInPosthog();
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com",
    ui_host: "https://eu.posthog.com",
    // Enable debug mode in development
    loaded: (posthog) => {
      if (process.env.NODE_ENV === "development") posthog.debug();
    },
    autocapture: false,
  });
}

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  const router = useRouter();

  useEffect(() => {
    // PostHog (cloud.langfuse.com)
    if (env.NEXT_PUBLIC_POSTHOG_KEY && env.NEXT_PUBLIC_POSTHOG_HOST) {
      const handleRouteChange = () => {
        setProjectInPosthog();
        posthog.capture("$pageview");
      };
      router.events.on("routeChangeComplete", handleRouteChange);

      return () => {
        router.events.off("routeChangeComplete", handleRouteChange);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <QueryParamProvider adapter={NextAdapterPages}>
      <TooltipProvider>
        <PostHogProvider client={posthog}>
          <SessionProvider
            session={session}
            refetchOnWindowFocus={true}
            refetchInterval={5 * 60} // 5 minutes
          >
            <DetailPageListsProvider>
              <MarkdownContextProvider>
                <ThemeProvider
                  attribute="class"
                  enableSystem
                  disableTransitionOnChange
                >
                  <Layout>
                    <Component {...pageProps} />
                    <UserTracking />
                  </Layout>
                </ThemeProvider>
              </MarkdownContextProvider>
              <CrispWidget />
            </DetailPageListsProvider>
          </SessionProvider>
        </PostHogProvider>
      </TooltipProvider>
    </QueryParamProvider>
  );
};

export default api.withTRPC(MyApp);

function UserTracking() {
  const session = useSession();

  const sessionUser = session.data?.user;

  useEffect(() => {
    if (sessionUser) {
      // PostHog
      if (env.NEXT_PUBLIC_POSTHOG_KEY && env.NEXT_PUBLIC_POSTHOG_HOST)
        posthog.identify(sessionUser.id ?? undefined, {
          environment: process.env.NODE_ENV,
          email: sessionUser.email ?? undefined,
          name: sessionUser.name ?? undefined,
          featureFlags: sessionUser.featureFlags ?? undefined,
          projects:
            sessionUser.organizations.flatMap((org) =>
              org.projects.map((project) => ({
                ...project,
                organization: org,
              })),
            ) ?? undefined,
          LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
        });
      const emailDomain = sessionUser.email?.split("@")[1];
      if (emailDomain)
        posthog.group("emailDomain", emailDomain, {
          domain: emailDomain,
        });

      // Sentry
      setUser({
        email: sessionUser.email ?? undefined,
        id: sessionUser.id ?? undefined,
      });

      // Chat
      chatSetUser({
        name: sessionUser.name ?? "undefined",
        email: sessionUser.email ?? "undefined",
        data: {
          userId: sessionUser.id ?? "undefined",
          organizations: sessionUser.organizations
            ? JSON.stringify(sessionUser.organizations)
            : "undefined",
          featureFlags: sessionUser.featureFlags
            ? JSON.stringify(sessionUser.featureFlags)
            : "undefined",
        },
      });
    } else {
      // PostHog
      if (env.NEXT_PUBLIC_POSTHOG_KEY && env.NEXT_PUBLIC_POSTHOG_HOST) {
        posthog.reset();
        posthog.resetGroups();
      }
      // Sentry
      setUser(null);
    }
  }, [sessionUser]);

  return null;
}

if (process.env.NEXT_MANUAL_SIG_HANDLE) {
  prexit(async (signal) => {
    console.log("Signal: ", signal);
    return await shutdown(signal);
  });
}
