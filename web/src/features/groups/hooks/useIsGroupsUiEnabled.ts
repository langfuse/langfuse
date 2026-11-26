import { useHasEntitlement } from "@/src/features/entitlements/hooks";

/**
 * useIsGroupsUiEnabled is true when the organization has the admin API
 * entitlement, which includes groups.
 */
export function useIsGroupsUiEnabled() {
  return useHasEntitlement("admin-api");
}
