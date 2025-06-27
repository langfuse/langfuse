import { type AppType } from "next/app";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { setUser } from "@sentry/nextjs";
import { useSession } from "next-auth/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { CommandMenuProvider } from "@/src/features/command-k-menu/CommandMenuProvider";

import { api } from "@/src/utils/api";

import NextAdapterPages from "next-query-params/pages";
import { QueryParamProvider } from "use-query-params";

import "@/src/styles/globals.css";
import Layout from "@/src/components/layouts/layout";
import { useEffect, useRef } from "react";
import { useRouter } from "next/router";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
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
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import PlainChat, {
  chatSetCustomer,
  chatSetThreadDetails,
} from "@/src/features/support-chat/PlainChat";

// Check that PostHog is client-side (used to handle Next.js SSR) and that env vars are set
if (
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_POSTHOG_KEY &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST
) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com",
    ui_host: "https://eu.posthog.com",
    // Enable debug mode in development
    loaded: (posthog) => {
      if (process.env.NODE_ENV === "development") posthog.debug();
    },
    session_recording: {
      maskCapturedNetworkRequestFn(request) {
        request.requestBody = request.requestBody ? "REDACTED" : undefined;
        request.responseBody = request.responseBody ? "REDACTED" : undefined;
        return request;
      },
    },
    autocapture: false,
    enable_heatmaps: false,
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
        <CommandMenuProvider>
          <PostHogProvider client={posthog}>
            <SessionProvider
              session={session}
              refetchOnWindowFocus={true}
              refetchInterval={5 * 60} // 5 minutes
              basePath={`${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth`}
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
                    <BetterStackUptimeStatusMessage />
                  </ThemeProvider>
                </MarkdownContextProvider>
                <PlainChat />
              </DetailPageListsProvider>
            </SessionProvider>
          </PostHogProvider>
        </CommandMenuProvider>
      </TooltipProvider>
    </QueryParamProvider>
  );
};

export default api.withTRPC(MyApp);

function UserTracking() {
  const session = useSession();
  const sessionUser = session.data?.user;
  const { organization } = useQueryProjectOrOrganization();

  // Track user identity and properties
  const lastIdentifiedUser = useRef<string | null>(null);
  useEffect(() => {
    if (
      session.status === "authenticated" &&
      sessionUser &&
      lastIdentifiedUser.current !== JSON.stringify(sessionUser)
    ) {
      lastIdentifiedUser.current = JSON.stringify(sessionUser);
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

      // Sentry
      setUser({
        email: sessionUser.email ?? undefined,
        id: sessionUser.id ?? undefined,
      });

      // Chat
      chatSetCustomer({
        email: sessionUser.email ?? undefined,
        fullName: sessionUser.name ?? undefined,
        emailHash: sessionUser.emailSupportHash ?? undefined,
        chatAvatarUrl: sessionUser.image ?? undefined,
      });
    } else if (session.status === "unauthenticated") {
      lastIdentifiedUser.current = null;
      // PostHog
      if (env.NEXT_PUBLIC_POSTHOG_KEY && env.NEXT_PUBLIC_POSTHOG_HOST) {
        posthog.reset();
      }
      // Sentry
      setUser(null);
    }
  }, [sessionUser, session.status]);

  // update chat thread details
  const plan = organization?.plan;
  // const currentOrgIsDemoOrg =
  //   env.NEXT_PUBLIC_DEMO_ORG_ID &&
  //   organization?.id &&
  //   organization.id === env.NEXT_PUBLIC_DEMO_ORG_ID;
  // const projectRole = project?.role;
  // const organizationRole = organization?.role;
  const organizationId = organization?.id;
  useEffect(() => {
    chatSetThreadDetails({
      orgId: organizationId ?? undefined,
      plan: plan ?? undefined,
    });
  }, [plan, organizationId]);

  // add stripe link to chat
  // const orgStripeLink = organization?.cloudConfig?.stripe?.customerId
  //   ? `https://dashboard.stripe.com/customers/${organization.cloudConfig.stripe.customerId}`
  //   : undefined;
  // useEffect(() => {
  //   if (orgStripeLink) {
  //     chatSetUser({
  //       data: {
  //         stripe: orgStripeLink,
  //       },
  //     });
  //   }
  // }, [orgStripeLink]);

  return null;
}

if (
  process.env.NEXT_RUNTIME === "nodejs" &&
  process.env.NEXT_MANUAL_SIG_HANDLE
) {
  const { shutdown } = await import("@/src/utils/shutdown");
  prexit(async (signal) => {
    console.log("Signal: ", signal);
    return await shutdown(signal);
  });
}

function BetterStackUptimeStatusMessage() {
  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) return null;
  return (
    <script
      src="https://uptime.betterstack.com/widgets/announcement.js"
      data-id="189328"
      async={true}
      type="text/javascript"
    ></script>
  );
}
