/**
 * Type definitions for navigation filtering system
 */

import type { Session } from "next-auth";
import type { Route } from "@/src/components/layouts/routes";
import type { Entitlement } from "@/src/features/entitlements/constants/entitlements";

/**
 * Context object containing all data needed for navigation filtering
 * Passed to each filter function to determine route visibility
 */
export type NavigationFilterContext = {
  /** Current project ID from router query params */
  routerProjectId: string | undefined;
  /** Current organization ID from router query params */
  routerOrganizationId: string | undefined;
  /** User session data including user info and environment */
  session: Session | null;
  /** Whether experimental features are enabled globally */
  enableExperimentalFeatures: boolean;
  /** Whether user is a cloud admin (bypasses most checks) */
  cloudAdmin: boolean;
  /** Plan-based entitlements available to current user/org */
  entitlements: Entitlement[];
  /** UI customization settings (enterprise feature) */
  uiCustomization: { visibleModules: string[] } | null;
  /** Whether the deployment is a Langfuse Cloud environment */
  isLangfuseCloud: boolean;
  /** Current router path for active state detection */
  currentPath: string;
};

/**
 * Filter function that processes a route and returns it (if visible) or null (if hidden)
 * Filters are composable and should be pure functions
 */
export type NavigationFilter = (
  route: Route,
  context: NavigationFilterContext,
) => Route | null;
