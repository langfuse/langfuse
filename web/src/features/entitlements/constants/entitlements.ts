import { type Plan } from "@/src/features/entitlements/constants/plans";

const entitlements = [
  // features
  "playground",
  "model-based-evaluations",
  // rbac
  "rbac-project-roles",
] as const;

export type Entitlement = (typeof entitlements)[number];

export const entitlementAccess: Record<Plan, Entitlement[]> = {
  oss: [],
  "cloud:hobby": ["playground", "model-based-evaluations"],
  "cloud:pro": ["playground", "model-based-evaluations"],
  "cloud:team": ["playground", "model-based-evaluations", "rbac-project-roles"],
  "self-hosted:enterprise": [
    "playground",
    "model-based-evaluations",
    "rbac-project-roles",
  ],
};
