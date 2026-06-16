import { useSession } from "next-auth/react";

/**
 * Whether the current user has opted into the grammar search bar via the
 * Feature Preview menu (sidebar user dropdown → Feature Preview → "Filter
 * Search Bar"). Per-user, stored on `user.featureFlags` (no project metadata,
 * no admin RBAC). The bar still only renders on the v4 events tables, so call
 * sites gate on `isBetaEnabled && useSearchBarEnabled()`.
 */
export function useSearchBarEnabled(): boolean {
  const session = useSession();
  return session.data?.user?.featureFlags.searchBar === true;
}
