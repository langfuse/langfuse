/**
 * Authentication guard hook
 * Determines if user should be redirected, signed out, or allowed to proceed
 */

import { useRouter } from "next/router";
import { PATH_CONSTANTS } from "../utils/pathClassification";
import { getSafeRedirectPath, stripBasePath } from "@/src/utils/redirect";
import type { SessionContextValue } from "next-auth/react";

/** Result of auth guard evaluation */
export type AuthGuardResult =
  | { action: "allow" }
  | { action: "loading"; message: string }
  | { action: "redirect"; url: string; message: string }
  | { action: "sign-out"; message: string };

/**
 * Evaluates authentication state and determines appropriate action
 * Handles:
 * - Loading states
 * - Invalid users (session exists but user is null)
 * - Unauthenticated users on protected routes
 * - Authenticated users on auth pages (with redirect)
 *
 * @param session - Session object from useSession hook
 * @returns Guard state indicating what action to take
 */
export function useAuthGuard(
  session: SessionContextValue,
  _hideNavigation: boolean,
): AuthGuardResult {
  const router = useRouter();
  const { pathname, query, asPath, isReady } = router;

  // Loading state
  if (session.status === "loading") {
    return { action: "loading", message: "Loading" };
  }

  const isUnauthPath = PATH_CONSTANTS.unauthenticated.some((p) =>
    pathname.startsWith(p),
  );
  const isPublicPath = pathname.startsWith("/public/");

  // Check if path is publishable (can be accessed without authentication)
  const isPublishable = PATH_CONSTANTS.publishable.some((path) => {
    // Case 1: Exact match (e.g., pathname === "/auth/reset-password")
    if (pathname === path) return true;

    // Case 2: Prefix match for dynamic routes
    // Example: path = "/project/[projectId]/traces/[traceId]"
    //   -> pathPrefix = "/project/[^/]+/traces" (last segment removed, params converted to regex)
    //   -> matches pathname like "/project/abc123/traces/xyz789"
    // This allows shared trace/session links to be accessed without authentication
    const pathPrefix = path
      .split("/")
      .slice(0, -1)
      .join("/")
      .replace(/\[([^\]]+)\]/g, "[^/]+");
    const prefixRegex = new RegExp(`^${pathPrefix}/`);
    return prefixRegex.test(pathname);
  });

  // Invalid user - has session but no DB user
  // This can happen if user was deleted from DB but still has valid JWT
  if (
    session.data &&
    session.data.user === null &&
    !isUnauthPath &&
    !isPublishable &&
    !isPublicPath
  ) {
    return { action: "sign-out", message: "Redirecting" };
  }

  // Unauthenticated user trying to access protected route
  if (
    session.status === "unauthenticated" &&
    !isUnauthPath &&
    !isPublishable &&
    !isPublicPath
  ) {
    // Before hydration, asPath is still the route pattern
    // (`/project/[projectId]/...`). Storing that as targetPath makes the
    // post-login router.replace throw href-interpolation-failed.
    if (!isReady) {
      return { action: "loading", message: "Loading" };
    }

    // asPath already includes the base path when accessed via browser.
    // Sanitize first (rejects open redirects and leftover route
    // patterns), then strip the base path so router.replace does not
    // double-prepend it.
    const rawPath = asPath || pathname || "/";
    const pathToStore = stripBasePath(getSafeRedirectPath(rawPath));

    // Only include targetPath if it's not the root
    const targetPathQuery =
      pathToStore !== "/"
        ? `?targetPath=${encodeURIComponent(pathToStore)}`
        : "";

    return {
      action: "redirect",
      url: `/auth/sign-in${targetPathQuery}`,
      message: "Redirecting",
    };
  }

  // Authenticated user on authentication page - redirect to target or home
  if (session.status === "authenticated" && isUnauthPath) {
    const queryTargetPath = query.targetPath as string | undefined;
    const redirectUrl = getSafeRedirectPath(queryTargetPath);
    const routerRedirectUrl = stripBasePath(redirectUrl);
    return {
      action: "redirect",
      url: routerRedirectUrl,
      message: "Redirecting",
    };
  }

  // All checks passed - allow access
  return { action: "allow" };
}
