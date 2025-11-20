/**
 * Composable navigation filter functions
 * Each filter is a pure function that can be tested in isolation
 */

import type { Route } from "@/src/components/layouts/routes";
import type { NavigationFilterContext } from "./navigationFilters.types";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

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
   */
  featureFlags: (route: Route, ctx: NavigationFilterContext): Route | null => {
    if (route.featureFlag === undefined) return route;

    const hasFlag =
      ctx.enableExperimentalFeatures ||
      ctx.cloudAdmin ||
      ctx.session?.user?.featureFlags?.[route.featureFlag] === true;

    return hasFlag ? route : null;
  },

  /**
   * Filter routes based on plan entitlements
   * OR logic - user needs at least one of the required entitlements
   */
  entitlements: (route: Route, ctx: NavigationFilterContext): Route | null => {
    if (!route.entitlements || route.entitlements.length === 0) return route;

    // OR logic - user needs at least one entitlement
    const hasEntitlement = route.entitlements.some((ent) =>
      ctx.entitlements.includes(ent),
    );

    return hasEntitlement ? route : null;
  },

  /**
   * Filter routes based on project-level RBAC scopes
   * OR logic - user needs at least one of the required scopes
   */
  projectRbac: (route: Route, ctx: NavigationFilterContext): Route | null => {
    if (!route.projectRbacScopes || !ctx.routerProjectId) return route;

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
   */
  organizationRbac: (
    route: Route,
    ctx: NavigationFilterContext,
  ): Route | null => {
    if (!route.organizationRbacScope || !ctx.routerOrganizationId) return route;

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
    ctx: NavigationFilterContext,
    organization: any,
  ): Route | null => {
    if (!route.show) return route;
    return route.show({ organization }) ? route : null;
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
  organization: any,
): Route | null {
  let filtered: Route | null = route;

  // Apply each filter in sequence - short circuit on first null
  filtered = filters.projectScope(filtered, ctx);
  if (!filtered) return null;

  filtered = filters.organizationScope(filtered, ctx);
  if (!filtered) return null;

  filtered = filters.uiCustomization(filtered, ctx);
  if (!filtered) return null;

  filtered = filters.featureFlags(filtered, ctx);
  if (!filtered) return null;

  filtered = filters.entitlements(filtered, ctx);
  if (!filtered) return null;

  filtered = filters.projectRbac(filtered, ctx);
  if (!filtered) return null;

  filtered = filters.organizationRbac(filtered, ctx);
  if (!filtered) return null;

  filtered = filters.customShow(filtered, ctx, organization);
  if (!filtered) return null;

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
  organization: any,
): Route[] {
  return routes
    .map((route) => applyFiltersToRoute(route, ctx, organization))
    .filter((route): route is Route => route !== null);
}
