import { signOut } from "next-auth/react";
import posthog from "posthog-js";
import { env } from "@/src/env.mjs";
import { isPostHogClientEnabled } from "@/src/features/posthog-analytics";
import { clearV4BetaEnabledSentryTag } from "@/src/utils/sentryV4BetaTag";

/**
 * Canonical client-side sign-out.
 *
 * Clears session-scoped storage and resets the PostHog identity (so
 * post-logout analytics aren't attributed to the previous user on shared
 * devices), then signs out to the base-path-aware sign-in route.
 *
 * Used by every sign-out entry point — the sidebar NavUser (via AppLayout) and
 * the mobile TopbarAccount — so cleanup stays in one place.
 */
export const signOutCleanly = async () => {
  sessionStorage.clear();
  // NextAuth redirecting signOut unloads the page before UserTracking can
  // see `unauthenticated`. Drop the pageload cache here so the sign-in
  // hard load is not tagged with the previous user's v4 state.
  clearV4BetaEnabledSentryTag();
  if (isPostHogClientEnabled()) {
    posthog.reset();
  }
  // On preview deployments the sign-in page signs visitors back in
  // automatically; an explicit sign-out must land on the opted-out form or
  // staying signed out via the UI is impossible.
  const autoSignInOptOut =
    env.NEXT_PUBLIC_PREVIEW_DEMO_AUTO_SIGN_IN === "true"
      ? "?autoSignIn=false"
      : "";
  await signOut({
    callbackUrl: `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/sign-in${autoSignInOptOut}`,
  });
};
