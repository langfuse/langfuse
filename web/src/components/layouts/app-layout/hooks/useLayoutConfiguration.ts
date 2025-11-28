/**
 * Hook to determine which layout variant to render
 * Combines path classification with session state to make the final decision
 */

import { useRouter } from "next/router";
import { useMemo } from "react";
import { classifyPath, type LayoutType } from "../utils/pathClassification";
import type { Session } from "next-auth";

export type LayoutConfiguration = {
  /** The layout variant to render */
  variant: LayoutType;
  /** Whether to hide the navigation sidebar */
  hideNavigation: boolean;
  /** Whether this is a publishable path (shared traces/sessions) */
  isPublishable: boolean;
};

/**
 * Determines the appropriate layout configuration based on:
 * - Path classification (auth pages, public pages, publishable paths)
 * - Session state (authenticated, unauthenticated, loading)
 *
 * Layout decision logic:
 * 1. Auth pages (sign-in, sign-up) → "unauthenticated" variant
 * 2. Unauthenticated user on non-publishable route → redirect (handled by authGuard)
 * 3. Unauthenticated user on publishable route → "minimal" variant
 * 4. Authenticated user on hideNavigation path → "minimal" variant
 * 5. Authenticated user on normal path → "authenticated" variant
 *
 * @param session - Current user session (null if unauthenticated)
 * @returns Layout configuration with variant type and navigation visibility
 */
export function useLayoutConfiguration(
  session: Session | null,
): LayoutConfiguration {
  const router = useRouter();

  return useMemo(() => {
    const { isAuthPage, hideNavigation, isPublishable } = classifyPath(
      router.pathname,
      router.asPath,
    );

    // Determine the layout variant based on path and session
    let variant: LayoutType = "authenticated";

    if (isAuthPage) {
      // Auth pages always use unauthenticated layout
      variant = "unauthenticated";
    } else if (session === null && !isPublishable) {
      // Unauthenticated user on protected route - will be redirected by authGuard
      // but we set variant for the brief moment before redirect
      variant = "unauthenticated";
    } else if (hideNavigation) {
      // Public routes, onboarding, etc.
      variant = "minimal";
    }

    return { variant, hideNavigation, isPublishable };
  }, [router.pathname, router.asPath, session]);
}
