/**
 * Type definitions for navigation filtering system
 */

import type { Session } from "next-auth";
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
  /** Whether Langfuse Cloud currently has a degraded or downtime incident */
  hasActiveCloudIncident: boolean;
  /** Current router path for active state detection */
  currentPath: string;
};
