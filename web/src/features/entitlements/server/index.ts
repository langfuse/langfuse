// The entitlements feature's server surface (RFC rule 9, amended).
export { createWithinEntitlementLimit } from "@/src/features/entitlements/server/createWithinEntitlementLimit";
export {
  getOrganizationPlanServerSide,
  getSelfHostedInstancePlanServerSide,
} from "@/src/features/entitlements/server/getPlan";
export {
  hasEntitlement,
  hasEntitlementBasedOnPlan,
  throwIfNoEntitlement,
} from "@/src/features/entitlements/server/hasEntitlement";
export {
  clampToDataAccessDays,
  hasEntitlementLimit,
} from "@/src/features/entitlements/server/hasEntitlementLimit";
