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

export type AuthGuardState =
  | { type: "allow" }
  | { type: "loading"; message: string }
  | { type: "redirect"; url: string; message: string }
  | { type: "sign-out"; message: string };

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
): AuthGuardState {
  const router = useRouter();

  return useMemo(() => {
    const { pathname, query, asPath } = router;
    const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";

    // Loading state
    if (session.status === "loading") {
      return { type: "loading", message: "Loading" };
    }

    const isUnauthPath = PATH_CONSTANTS.unauthenticated.some((p) =>
      pathname.startsWith(p),
    );
    const isPublishable = PATH_CONSTANTS.publishable.some(
      (p) =>
        pathname === p || pathname.startsWith(p.replace("[projectId]", "")),
    );

    // Invalid user - has session but no DB user
    // This can happen if user was deleted from DB but still has valid JWT
    if (
      session.data &&
      session.data.user === null &&
      !isUnauthPath &&
      !isPublishable
    ) {
      return { type: "sign-out", message: "Redirecting" };
    }

    // Unauthenticated user trying to access protected route
    if (
      session.status === "unauthenticated" &&
      !isUnauthPath &&
      !isPublishable
    ) {
      const targetPath = encodeURIComponent(
        basePath + (pathname === "/" ? pathname : asPath),
      );
      return {
        type: "redirect",
        url: `/auth/sign-in?targetPath=${targetPath}`,
        message: "Redirecting",
      };
    }

    // Authenticated user on authentication page - redirect to target or home
    if (session.status === "authenticated" && isUnauthPath) {
      const queryTargetPath = query.targetPath as string | undefined;
      const redirectUrl = getSafeRedirectPath(queryTargetPath);
      return { type: "redirect", url: redirectUrl, message: "Redirecting" };
    }

    // All checks passed - allow access
    return { type: "allow" };
  }, [session.status, session.data, router]);
}
