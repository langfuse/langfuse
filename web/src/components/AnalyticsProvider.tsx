import React, {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { setUser } from "@sentry/nextjs";
import { type PostHog } from "posthog-js";

import Script from "next/script";

import { env } from "@/src/env.mjs";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { PostHogContextProvider } from "@/src/features/posthog-analytics/PostHogContext";
import { useRef } from "react";

interface AnalyticsProviderProps {
  children: ReactNode;
}

/**
 * Hook to initialize PostHog dynamically
 * Returns the posthog instance or null if not configured
 */
function useInitializeAnalytics() {
  const [posthogInstance, setPosthogInstance] = useState<PostHog | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (
      !initRef.current &&
      typeof window !== "undefined" &&
      env.NEXT_PUBLIC_POSTHOG_KEY &&
      env.NEXT_PUBLIC_POSTHOG_HOST
    ) {
      initRef.current = true;

      // Dynamically import and initialize PostHog
      import("posthog-js").then((posthogModule) => {
        const posthog = posthogModule.default;
        if (!env.NEXT_PUBLIC_POSTHOG_KEY) return; // make TS happy

        posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
          api_host: env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com",
          ui_host: "https://eu.posthog.com",
          // Enable debug mode in development
          loaded: (posthog: any) => {
            if (process.env.NODE_ENV === "development") posthog.debug();
          },
          session_recording: {
            maskCapturedNetworkRequestFn(request: any) {
              request.requestBody = request.requestBody
                ? "REDACTED"
                : undefined;
              request.responseBody = request.responseBody
                ? "REDACTED"
                : undefined;
              return request;
            },
          },
          autocapture: false,
          enable_heatmaps: false,
        });

        setPosthogInstance(posthog);
      });
    }
  }, []);

  return posthogInstance;
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
  // Initialize PostHog on first render and get the instance
  const posthogInstance = useInitializeAnalytics();

  const router = useRouter();
  const session = useSession();
  const { region } = useLangfuseCloudRegion();
  const sessionUser = session.data?.user;

  // Track user identity and properties
  const lastIdentifiedUser = useRef<string | null>(null);

  const handleRouteChange = useEffectEvent(() => {
    if (posthogInstance) {
      posthogInstance.capture("$pageview");
    }
  });

  // PostHog page view tracking
  useEffect(() => {
    router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
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
      if (posthogInstance) {
        posthogInstance.identify(sessionUser.id ?? undefined, {
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
      }

      // Sentry
      setUser({
        email: sessionUser.email ?? undefined,
        id: sessionUser.id ?? undefined,
      });
    } else if (session.status === "unauthenticated") {
      lastIdentifiedUser.current = null;
      // PostHog
      if (posthogInstance) {
        posthogInstance.reset();
      }
      // Sentry
      setUser(null);
    }
  }, [sessionUser, session.status, region, posthogInstance]);

  // Only render PostHogContextProvider if we have a posthog instance
  if (!posthogInstance) {
    return (
      <>
        {children}
        <BetterStackUptimeStatusMessage />
      </>
    );
  }

  return (
    <PostHogContextProvider posthogInstance={posthogInstance}>
      {children}
      <BetterStackUptimeStatusMessage />
    </PostHogContextProvider>
  );
};

function BetterStackUptimeStatusMessage() {
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  if (!isLangfuseCloud) return null;

  return (
    <Script
      src="https://uptime.betterstack.com/widgets/announcement.js"
      data-id="189328"
      strategy="lazyOnload"
    />
  );
}
