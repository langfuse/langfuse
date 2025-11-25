/**
 * Authentication guard hook
 * Determines if user should be redirected, signed out, or allowed to proceed
 */

import { useRouter } from "next/router";
import { useMemo } from "react";
import { env } from "@/src/env.mjs";
import { PATH_CONSTANTS } from "../utils/pathClassification";
import { getSafeRedirectPath } from "@/src/utils/redirect";
import type { useSession } from "next-auth/react";

/** Actions the auth guard can request */
export type AuthGuardAction = "allow" | "loading" | "redirect" | "sign-out";

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
  session: ReturnType<typeof useSession>,
  _hideNavigation: boolean,
): AuthGuardResult {
  const router = useRouter();

  return useMemo(() => {
    const { pathname, query, asPath } = router;
    const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";

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
      const targetPath = encodeURIComponent(
        basePath + (pathname === "/" ? pathname : asPath),
      );
      return {
        action: "redirect",
        url: `/auth/sign-in?targetPath=${targetPath}`,
        message: "Redirecting",
      };
    }

    // Authenticated user on authentication page - redirect to target or home
    if (session.status === "authenticated" && isUnauthPath) {
      const queryTargetPath = query.targetPath as string | undefined;
      const redirectUrl = getSafeRedirectPath(queryTargetPath);
      return { action: "redirect", url: redirectUrl, message: "Redirecting" };
    }

    // All checks passed - allow access
    return { action: "allow" };
  }, [session.status, session.data, router]);
}
