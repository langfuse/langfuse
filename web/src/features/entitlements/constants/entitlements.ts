import { type Plan } from "@langfuse/shared";

// Entitlements: Binary feature access
const entitlements = [
  // features
  "playground",
  "model-based-evaluations",
  "rbac-project-roles",
  "cloud-billing",
  "integration-posthog",
  "annotation-queues",
  "self-host-ui-customization",
  "self-host-allowed-organization-creators",
  "prompt-experiments",
] as const;
export type Entitlement = (typeof entitlements)[number];

const cloudAllPlansEntitlements: Entitlement[] = [
  "playground",
  "model-based-evaluations",
  "cloud-billing",
  "integration-posthog",
  "annotation-queues",
  "prompt-experiments",
];

// Entitlement Limits: Limits on the number of resources that can be created/used
const entitlementLimits = [
  "annotation-queue-count",
  "organization-member-count",
  "data-access-days",
  "model-based-evaluations-count-evaluators",
  "prompt-management-count-prompts",
] as const;
export type EntitlementLimit = (typeof entitlementLimits)[number];

export type EntitlementLimits = Record<
  EntitlementLimit,
  | number // if limited
  | false // unlimited
>;

export const entitlementAccess: Record<
  Plan,
  {
    entitlements: Entitlement[];
    entitlementLimits: EntitlementLimits;
  }
> = {
  "cloud:hobby": {
    entitlements: [...cloudAllPlansEntitlements],
    entitlementLimits: {
      "organization-member-count": 2,
      "data-access-days": 30,
      "annotation-queue-count": 1,
      "model-based-evaluations-count-evaluators": 1,
      "prompt-management-count-prompts": 10,
    },
  },
  "cloud:pro": {
    entitlements: [...cloudAllPlansEntitlements],
    entitlementLimits: {
      "annotation-queue-count": 3,
      "organization-member-count": false,
      "data-access-days": false,
      "model-based-evaluations-count-evaluators": false,
      "prompt-management-count-prompts": false,
    },
  },
  "cloud:team": {
    entitlements: [...cloudAllPlansEntitlements, "rbac-project-roles"],
    entitlementLimits: {
      "annotation-queue-count": false,
      "organization-member-count": false,
      "data-access-days": false,
      "model-based-evaluations-count-evaluators": false,
      "prompt-management-count-prompts": false,
    },
  },
  oss: {
    entitlements: [],
    entitlementLimits: {
      "annotation-queue-count": 0,
      "organization-member-count": false,
      "data-access-days": false,
      "model-based-evaluations-count-evaluators": false,
      "prompt-management-count-prompts": false,
    },
  },
  "self-hosted:pro": {
    entitlements: [
      "annotation-queues",
      "model-based-evaluations",
      "playground",
      "prompt-experiments",
    ],
    entitlementLimits: {
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
      "model-based-evaluations",
      "playground",
      "prompt-experiments",
      "rbac-project-roles",
      "self-host-allowed-organization-creators",
      "self-host-ui-customization",
    ],
    entitlementLimits: {
      "annotation-queue-count": false,
      "organization-member-count": false,
      "data-access-days": false,
      "model-based-evaluations-count-evaluators": false,
      "prompt-management-count-prompts": false,
    },
  },
};
