import { type Plan } from "@langfuse/shared";

const entitlements = [
  // features
  "playground",
  "model-based-evaluations",
  "rbac-project-roles",
  "cloud-billing",
  "integration-posthog",
  "batch-export",
  "annotation-queues",
  "experiments",
] as const;

export type Entitlement = (typeof entitlements)[number];

const cloudAllPlansEntitlements: Entitlement[] = [
  "playground",
  "model-based-evaluations",
  "cloud-billing",
  "integration-posthog",
  "batch-export",
  "annotation-queues",
  "experiments",
];

export const entitlementAccess: Record<Plan, Entitlement[]> = {
  oss: [],
  "cloud:hobby": [...cloudAllPlansEntitlements],
  "cloud:pro": [...cloudAllPlansEntitlements],
  "cloud:team": [...cloudAllPlansEntitlements, "rbac-project-roles"],
  "self-hosted:enterprise": [
    "annotation-queues",
    "playground",
    "rbac-project-roles",
    // `LANGFUSE_ALLOWED_ORGANIZATION_CREATORS` -> directly checked on instance level in auth.ts
  ],
};
