// The entitlements feature's server surface (RFC rule 9, amended).
export { createWithinEntitlementLimit } from "@/src/entitlements/server/createWithinEntitlementLimit";
export {
  getOrganizationPlanServerSide,
  getSelfHostedInstancePlanServerSide,
} from "@/src/entitlements/server/getPlan";
export {
  hasEntitlement,
  hasEntitlementBasedOnPlan,
  throwIfNoEntitlement,
} from "@/src/entitlements/server/hasEntitlement";
export {
  clampToDataAccessDays,
  hasEntitlementLimit,
} from "@/src/entitlements/server/hasEntitlementLimit";
