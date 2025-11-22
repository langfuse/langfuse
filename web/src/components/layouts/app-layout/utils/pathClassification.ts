/**
 * Path classification utilities for layout routing
 * Determines which layout variant to render based on current path
 */

export const PATH_CONSTANTS = {
  withoutNavigation: ["/onboarding", "/auth/reset-password"] as const,
  unauthenticated: [
    "/auth/sign-in",
    "/auth/sign-up",
    "/auth/sso-initiate",
    "/auth/error",
    "/auth/hf-spaces",
  ] as const,
  publishable: [
    "/project/[projectId]/sessions/[sessionId]",
    "/project/[projectId]/traces/[traceId]",
    "/auth/reset-password",
  ] as const,
};

export type LayoutVariant =
  | "loading"
  | "unauthenticated"
  | "minimal"
  | "authenticated";

/**
 * Classifies the current path to determine layout configuration
 */
export function classifyPath(
  pathname: string,
  _asPath: string,
): {
  variant: LayoutVariant;
  hideNavigation: boolean;
  isPublishable: boolean;
} {
  const isPublicPath = pathname.startsWith("/public/");
  const isWithoutNavigation = PATH_CONSTANTS.withoutNavigation.some((path) =>
    pathname.startsWith(path),
  );
  const isUnauthenticated = PATH_CONSTANTS.unauthenticated.some((path) =>
    pathname.startsWith(path),
  );
  const isPublishable = PATH_CONSTANTS.publishable.some(
    (path) =>
      pathname === path || pathname.startsWith(path.replace("[projectId]", "")),
  );

  // Determine if navigation should be hidden
  const hideNavigation =
    isPublicPath || isWithoutNavigation || isUnauthenticated;

  // Determine variant (will be overridden by session status in hook)
  let variant: LayoutVariant = "authenticated";
  if (isUnauthenticated) {
    variant = "unauthenticated";
  } else if (hideNavigation) {
    variant = "minimal";
  }

  return {
    variant,
    hideNavigation,
    isPublishable,
  };
}

/**
 * Determines if a route path is currently active
 * Handles exact matches and prefix matching with special logic for root paths
 *
 * @param routePath - The route path pattern (e.g., "/project/[projectId]/traces")
 * @param currentPath - The current router path
 * @returns true if the route should be highlighted as active
 */
export function isPathActive(routePath: string, currentPath: string): boolean {
  // Exact match
  if (currentPath === routePath) return true;

  // Only allow prefix matching if the route ends with a specific page (not just project root)
  // This prevents /project/123 from matching /project/123/datasets
  const isRoot = routePath.split("/").length <= 3;
  if (isRoot) return false;

  return currentPath.startsWith(routePath + "/");
}
