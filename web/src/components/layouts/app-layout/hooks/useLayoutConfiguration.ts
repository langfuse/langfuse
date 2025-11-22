/**
 * Hook to determine which layout variant to render
 * based on current path and session status
 */

import { useRouter } from "next/router";
import { useMemo } from "react";
import { classifyPath, type LayoutVariant } from "../utils/pathClassification";
import type { Session } from "next-auth";

/**
 * Determines the appropriate layout configuration based on:
 * - Current pathname and asPath
 * - Session status and authentication state
 * - Special path classifications (public, auth, publishable)
 *
 * @param session - Current user session (null if unauthenticated)
 * @returns Layout configuration with variant type and navigation visibility
 */
export function useLayoutConfiguration(session: Session | null) {
  const router = useRouter();

  return useMemo(() => {
    const { variant, hideNavigation, isPublishable } = classifyPath(
      router.pathname,
      router.asPath,
    );

    // Override variant based on session status
    // If no session and not a publishable route, force unauthenticated layout
    if (session === null && !isPublishable) {
      return {
        variant: "unauthenticated" as LayoutVariant,
        hideNavigation: true,
        isPublishable: false,
      };
    }

    return { variant, hideNavigation, isPublishable };
  }, [router.pathname, router.asPath, session]);
}
