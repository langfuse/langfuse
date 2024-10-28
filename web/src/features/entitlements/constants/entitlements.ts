import { type Plan } from "@langfuse/shared";

// Binary feature access
const entitlements = [
  // features
  "playground",
  "model-based-evaluations",
  "rbac-project-roles",
  "cloud-billing",
  "integration-posthog",
  "batch-export",
  "annotation-queues",
] as const;
export type Entitlement = (typeof entitlements)[number];

// Limits
const limits = [
  "annotation-queue-count",
  "organization-member-count",
  "data-access-days",
  "model-based-evaluations-count-evaluators",
  "prompt-management-count-prompts",
] as const;
export type Limit = (typeof limits)[number];

const cloudAllPlansEntitlements: Entitlement[] = [
  "playground",
  "model-based-evaluations",
  "cloud-billing",
  "integration-posthog",
  "batch-export",
  "annotation-queues",
];

export const entitlementAccess: Record<
  Plan,
  {
    entitlements: Entitlement[];
    limits: Record<
      Limit,
      | number // if limited
      | false // unlimited
    >;
  }
> = {
  oss: {
    entitlements: [],
    limits: {
      "annotation-queue-count": 0,
      "organization-member-count": false,
      "data-access-days": false,
      "model-based-evaluations-count-evaluators": false,
      "prompt-management-count-prompts": false,
    },
  },
  "cloud:hobby": {
    entitlements: [...cloudAllPlansEntitlements],
    limits: {
      "organization-member-count": 2,
      "data-access-days": 30,
      "annotation-queue-count": 1,
      "model-based-evaluations-count-evaluators": 1,
      "prompt-management-count-prompts": 10,
    },
  },
  "cloud:pro": {
    entitlements: [...cloudAllPlansEntitlements],
    limits: {
      "annotation-queue-count": 3,
      "organization-member-count": false,
      "data-access-days": false,
      "model-based-evaluations-count-evaluators": false,
      "prompt-management-count-prompts": false,
    },
  },
  "cloud:team": {
    entitlements: [...cloudAllPlansEntitlements, "rbac-project-roles"],
    limits: {
      "annotation-queue-count": false,
      "organization-member-count": false,
      "data-access-days": false,
      "model-based-evaluations-count-evaluators": false,
      "prompt-management-count-prompts": false,
    },
  },
  "self-hosted:enterprise": {
    entitlements: [
      "annotation-queues",
      "playground",
      "rbac-project-roles",
      // `LANGFUSE_ALLOWED_ORGANIZATION_CREATORS` -> directly checked on instance level in auth.ts
    ],
    limits: {
      "annotation-queue-count": false,
      "organization-member-count": false,
      "data-access-days": false,
      "model-based-evaluations-count-evaluators": false,
      "prompt-management-count-prompts": false,
    },
  },
};
