/**
 * Composable navigation filter functions
 * Each filter is a pure function that can be tested in isolation
 */

import type { Route } from "@/src/components/layouts/routes";
import type { NavigationFilterContext } from "./navigationFilters.types";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import type { User } from "next-auth";
import type { Flag } from "@/src/features/feature-flags/types";

/** Organization type from user session (can be null when not in project/org context) */
type Organization = User["organizations"][number] | null | undefined;

// Admin-only flags that don't respect experimental features
const adminOnlyFlags: Flag[] = ["experimentsV4Enabled"];

/**
 * Individual filter functions - each handles one concern
 * Exported for testing and composition
 */
export const filters = {
  /**
   * Filter routes that require a project ID when none is available
   */
  projectScope: (route: Route, ctx: NavigationFilterContext): Route | null => {
    if (!ctx.routerProjectId && route.pathname.includes("[projectId]")) {
      return null;
    }
    return route;
  },

  /**
   * Filter routes that require an organization ID when none is available
   */
  organizationScope: (
    route: Route,
    ctx: NavigationFilterContext,
  ): Route | null => {
    if (
      !ctx.routerOrganizationId &&
      route.pathname.includes("[organizationId]")
    ) {
      return null;
    }
    return route;
  },

  /**
   * Filter routes based on UI customization settings (enterprise feature)
   * Hides routes if their product module is not in visible modules list
   */
  uiCustomization: (
    route: Route,
    ctx: NavigationFilterContext,
  ): Route | null => {
    if (
      route.productModule &&
      ctx.uiCustomization &&
      !ctx.uiCustomization.visibleModules.includes(route.productModule)
    ) {
      return null;
    }
    return route;
  },

  /**
   * Filter routes based on feature flags
   * Shows route if:
   * - No flag requirement
   * - Experimental features enabled
   * - User is cloud admin
   * - User has specific feature flag
   * - For v4Beta: also show when user email ends with @langfuse.com, feature flag is set and we are in a cloud environment
   */
  featureFlags: (route: Route, ctx: NavigationFilterContext): Route | null => {
    if (route.featureFlag === undefined) return route;

    if (route.featureFlag && adminOnlyFlags.includes(route.featureFlag)) {
      if (!ctx.isLangfuseCloud) return null;

      // Only check admin and user flag, skip experimental features
      return ctx.cloudAdmin ||
        ctx.session?.user?.featureFlags?.[route.featureFlag] === true
        ? route
        : null;
    }

    const hasFlag =
      ctx.enableExperimentalFeatures ||
      ctx.cloudAdmin ||
      ctx.session?.user?.featureFlags?.[route.featureFlag] === true;
    // TODO: remove when v4 beta is GA
    // v4 beta toggle special cases
    const isV4BetaRoute = route.featureFlag === "v4BetaToggleVisible";
    const isLangfuseTeam =
      ctx.isLangfuseCloud &&
      ctx.session?.user?.email?.endsWith("@langfuse.com") === true;
    const hasCloudFlag =
      ctx.isLangfuseCloud &&
      ctx.session?.user?.featureFlags?.[route.featureFlag] === true;
    // ungated: opted-in users must see toggle to turn it off regardless of env
    const hasOptedIn = ctx.session?.user?.v4BetaEnabled === true;
    const isV4BetaVisible =
      isV4BetaRoute && (isLangfuseTeam || hasOptedIn || hasCloudFlag);

    return hasFlag || isV4BetaVisible ? route : null;
  },

  /**
   * Filter routes based on plan entitlements
   * OR logic - user needs at least one of the required entitlements
   * Cloud admins bypass this check
   */
  entitlements: (route: Route, ctx: NavigationFilterContext): Route | null => {
    if (!route.entitlements || route.entitlements.length === 0) return route;

    // Cloud admins bypass entitlement checks
    if (ctx.cloudAdmin) return route;

    // OR logic - user needs at least one entitlement
    const hasEntitlement = route.entitlements.some((ent) =>
      ctx.entitlements.includes(ent),
    );

    return hasEntitlement ? route : null;
  },

  /**
   * Filter routes based on project-level RBAC scopes
   * OR logic - user needs at least one of the required scopes
   * Cloud admins bypass this check
   */
  projectRbac: (route: Route, ctx: NavigationFilterContext): Route | null => {
    if (!route.projectRbacScopes || !ctx.routerProjectId) return route;

    // Cloud admins bypass RBAC checks
    if (ctx.cloudAdmin) return route;

    // OR logic - user needs at least one scope
    const hasScope = route.projectRbacScopes.some((scope) =>
      hasProjectAccess({
        session: ctx.session,
        projectId: ctx.routerProjectId!,
        scope,
      }),
    );

    return hasScope ? route : null;
  },

  /**
   * Filter routes based on organization-level RBAC scope
   * Cloud admins bypass this check
   */
  organizationRbac: (
    route: Route,
    ctx: NavigationFilterContext,
  ): Route | null => {
    if (!route.organizationRbacScope || !ctx.routerOrganizationId) return route;

    // Cloud admins bypass RBAC checks
    if (ctx.cloudAdmin) return route;

    const hasScope = hasOrganizationAccess({
      session: ctx.session,
      organizationId: ctx.routerOrganizationId,
      scope: route.organizationRbacScope,
    });

    return hasScope ? route : null;
  },

  /**
   * Filter routes based on custom show function
   * Allows routes to implement custom visibility logic
   */
  customShow: (
    route: Route,
    _ctx: NavigationFilterContext,
    organization: Organization,
  ): Route | null => {
    if (!route.show) return route;
    // Convert null to undefined for route.show compatibility
    return route.show({ organization: organization ?? undefined })
      ? route
      : null;
  },
};

/**
 * Apply all filters to a single route in sequence
 * Returns null if any filter rejects the route
 * Recursively processes nested items
 */
function applyFiltersToRoute(
  route: Route,
  ctx: NavigationFilterContext,
  organization: Organization | undefined,
): Route | null {
  // Apply filters in sequence - chain short-circuits on first null
  const filterChain = [
    filters.projectScope,
    filters.organizationScope,
    filters.uiCustomization,
    filters.featureFlags,
    filters.entitlements,
    filters.projectRbac,
    filters.organizationRbac,
    (r: Route) => filters.customShow(r, ctx, organization),
  ];

  let filtered: Route | null = route;
  for (const filter of filterChain) {
    filtered = filter(filtered, ctx);
    if (!filtered) return null;
  }

  // Process nested items recursively
  if (filtered.items && filtered.items.length > 0) {
    const filteredItems = filtered.items
      .map((item) => applyFiltersToRoute(item, ctx, organization))
      .filter((item): item is Route => item !== null);

    // If all children were filtered out, hide parent too
    if (filteredItems.length === 0) {
      return null;
    }

    filtered = { ...filtered, items: filteredItems };
  }

  return filtered;
}

/**
 * Main filter function - applies all filters to an array of routes
 * This is the primary export used by useFilteredNavigation hook
 *
 * @param routes - Array of route definitions to filter
 * @param ctx - Filter context with all necessary data
 * @param organization - Current organization object
 * @returns Filtered array of routes visible to current user
 */
export function applyNavigationFilters(
  routes: Route[],
  ctx: NavigationFilterContext,
  organization: Organization,
): Route[] {
  return routes
    .map((route) => applyFiltersToRoute(route, ctx, organization))
    .filter((route): route is Route => route !== null);
}
