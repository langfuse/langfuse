import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled";

/**
 * useIsGroupsUiEnabled is true when the organization has the admin API
 * entitlement, which includes groups, and the user is in Internal view.
 */
export function useIsGroupsUiEnabled() {
  const hasAdminApiEntitlement = useHasEntitlement("admin-api");
  const internalFeaturesEnabled = useInternalFeaturesEnabled();
  return hasAdminApiEntitlement && internalFeaturesEnabled;
}
