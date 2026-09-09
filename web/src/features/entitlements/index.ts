// The entitlements feature's public client surface (RFC rule 8): the React
// hooks only. Everything that reads a plan on the server lives behind
// server/index.ts so that importing this file cannot pull server code into a
// client bundle.
export type { Entitlement } from "@/src/features/entitlements/constants/entitlements";
export {
  useEntitlementLimit,
  useHasEntitlement,
  useOptionalEntitlement,
  usePlan,
} from "@/src/features/entitlements/hooks";
