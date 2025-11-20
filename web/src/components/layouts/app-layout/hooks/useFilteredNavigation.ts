/**
 * Hook to filter and process navigation based on user permissions and context
 * Implements memoization to prevent unnecessary recalculations
 */

import { useRouter } from "next/router";
import { useMemo } from "react";
import type { Session } from "next-auth";
import { useEntitlements } from "@/src/features/entitlements/hooks";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { ROUTES, type Route } from "@/src/components/layouts/routes";
import {
  processNavigation,
  type NavigationItem,
} from "@/src/components/layouts/utilities/routes";
import { applyNavigationFilters } from "../utils/navigationFilters";
import type { NavigationFilterContext } from "../utils/navigationFilters.types";
import { isPathActive } from "../utils/pathClassification";

/**
 * Filters and processes navigation items based on:
 * - Project/organization context
 * - User permissions (RBAC)
 * - Plan entitlements
 * - Feature flags
 * - UI customization settings
 *
 * Returns navigation split into main/secondary sections with active states
 *
 * @param session - Current user session
 * @param organization - Current organization object
 * @returns Processed navigation with main, secondary, and flattened arrays
 */
export function useFilteredNavigation(
  session: Session | null,
  organization: any,
) {
  const router = useRouter();
  const entitlements = useEntitlements();
  const uiCustomization = useUiCustomization();
  const { isLangfuseCloud, region } = useLangfuseCloudRegion();

  const routerProjectId = router.query.projectId as string | undefined;
  const routerOrganizationId = router.query.organizationId as
    | string
    | undefined;

  // Memoize filter context to prevent unnecessary recalculations
  const filterContext = useMemo<NavigationFilterContext>(
    () => ({
      routerProjectId,
      routerOrganizationId,
      session,
      enableExperimentalFeatures:
        session?.environment?.enableExperimentalFeatures ?? false,
      cloudAdmin: Boolean(
        session?.user?.admin && isLangfuseCloud && region !== "DEV",
      ),
      entitlements,
      uiCustomization,
      currentPath: router.asPath,
    }),
    [
      routerProjectId,
      routerOrganizationId,
      session,
      entitlements,
      uiCustomization,
      router.asPath,
      isLangfuseCloud,
      region,
    ],
  );

  // Memoize filtered routes
  const filteredRoutes = useMemo(() => {
    return applyNavigationFilters(ROUTES, filterContext, organization);
  }, [filterContext, organization]);

  // Create mapper function to add url and isActive properties
  const mapRouteToNavigationItem = useMemo(
    () =>
      (route: Route): NavigationItem | null => {
        const url = route.pathname
          ?.replace("[projectId]", routerProjectId ?? "")
          .replace("[organizationId]", routerOrganizationId ?? "");

        // Recursively map nested items
        const items: NavigationItem[] =
          route.items
            ?.map(mapRouteToNavigationItem)
            .filter((item): item is NavigationItem => item !== null) ?? [];

        return {
          ...route,
          url,
          isActive: isPathActive(route.pathname, router.pathname),
          items: items.length > 0 ? items : undefined,
        };
      },
    [routerProjectId, routerOrganizationId, router.pathname],
  );

  // Memoize processed navigation
  // processNavigation expects a mapper function, but we already have filtered routes
  // So we need to create a wrapper that processes our filtered routes
  return useMemo(() => {
    const mapper = (route: Route): NavigationItem | null => {
      // Check if this route is in our filtered list
      const isFiltered = filteredRoutes.some(
        (r) => r.pathname === route.pathname,
      );
      if (!isFiltered) return null;

      return mapRouteToNavigationItem(route);
    };

    return processNavigation(mapper);
  }, [filteredRoutes, mapRouteToNavigationItem]);
}
