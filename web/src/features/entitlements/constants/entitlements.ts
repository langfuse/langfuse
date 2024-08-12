import { type Plan } from "@/src/features/entitlements/constants/plans";

const entitlements = [
  // features
  "playground",
  "model-based-evaluations",
  "rbac-project-roles",
  "cloud-usage-metering",
  "integration-posthog",
  "batch-export",
] as const;

export type Entitlement = (typeof entitlements)[number];

const cloudAllPlansEntitlements: Entitlement[] = [
  "playground",
  "model-based-evaluations",
  "cloud-usage-metering",
  "integration-posthog",
  "batch-export",
];

export const entitlementAccess: Record<Plan, Entitlement[]> = {
  oss: [],
  "cloud:hobby": [...cloudAllPlansEntitlements],
  "cloud:pro": [...cloudAllPlansEntitlements],
  "cloud:team": [...cloudAllPlansEntitlements, "rbac-project-roles"],
  "self-hosted:enterprise": [
    "playground",
    "model-based-evaluations",
    "rbac-project-roles",
  ],
};
