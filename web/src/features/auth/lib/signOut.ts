import { signOut } from "next-auth/react";
import posthog from "posthog-js";
import { env } from "@/src/env.mjs";

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
  if (env.NEXT_PUBLIC_POSTHOG_KEY && env.NEXT_PUBLIC_POSTHOG_HOST) {
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
