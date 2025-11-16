import React, { type ReactNode, useEffect } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { setUser } from "@sentry/nextjs";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import Script from "next/script";

import { env } from "@/src/env.mjs";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useRef } from "react";

// Initialize PostHog on client-side
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

interface AnalyticsProviderProps {
  children: ReactNode;
}

/**
 * AnalyticsProvider combines all analytics and tracking functionality:
 * - PostHog initialization and page view tracking
 * - User identification and tracking
 * - BetterStack uptime status
 */
export const AnalyticsProvider: React.FC<AnalyticsProviderProps> = ({
  children,
}) => {
  const router = useRouter();
  const session = useSession();
  const { region } = useLangfuseCloudRegion();
  const sessionUser = session.data?.user;

  // Track user identity and properties
  const lastIdentifiedUser = useRef<string | null>(null);

  // PostHog page view tracking
  useEffect(() => {
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
          LANGFUSE_CLOUD_REGION: region,
        });

      // Sentry
      setUser({
        email: sessionUser.email ?? undefined,
        id: sessionUser.id ?? undefined,
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
  }, [sessionUser, session.status, region]);

  return (
    <PostHogProvider client={posthog}>
      {children}
      <BetterStackUptimeStatusMessage />
    </PostHogProvider>
  );
};

function BetterStackUptimeStatusMessage() {
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  if (!isLangfuseCloud) return null;

  return (
    <Script
      src="https://uptime.betterstack.com/widgets/announcement.js"
      data-id="189328"
      strategy="afterInteractive"
    />
  );
}
