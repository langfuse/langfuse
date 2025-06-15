import { type Plan } from "@langfuse/shared";

// Entitlements: Binary feature access
const entitlements = [
  // features
  "rbac-project-roles",
  "cloud-billing",
  "cloud-multi-tenant-sso",
  "self-host-ui-customization",
  "self-host-allowed-organization-creators",
  "trace-deletion", // Not in use anymore, but necessary to use the TableAction type.
  "audit-logs",
  "data-retention",
  "prompt-protected-labels",
  "admin-api",
] as const;
export type Entitlement = (typeof entitlements)[number];

const cloudAllPlansEntitlements: Entitlement[] = [
  "cloud-billing",
  "trace-deletion",
];

const selfHostedAllPlansEntitlements: Entitlement[] = ["trace-deletion"];

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
      "organization-member-count": 3, // 2 acc to billing page, 1 overage possible
      "data-access-days": 30,
      "annotation-queue-count": 1,
      "model-based-evaluations-count-evaluators": 1,
      "prompt-management-count-prompts": false,
    },
  },
  "cloud:core": {
    entitlements: [...cloudAllPlansEntitlements],
    entitlementLimits: {
      "organization-member-count": false,
      "data-access-days": 90,
      "annotation-queue-count": 3,
      "model-based-evaluations-count-evaluators": false,
      "prompt-management-count-prompts": false,
    },
  },
  "cloud:pro": {
    entitlements: [...cloudAllPlansEntitlements],
    entitlementLimits: {
      "annotation-queue-count": false,
      "organization-member-count": false,
      "data-access-days": false,
      "model-based-evaluations-count-evaluators": false,
      "prompt-management-count-prompts": false,
    },
  },
  "cloud:team": {
    entitlements: [
      ...cloudAllPlansEntitlements,
      "rbac-project-roles",
      "audit-logs",
      "data-retention",
      "cloud-multi-tenant-sso",
      "prompt-protected-labels",
      "admin-api",
    ],
    entitlementLimits: {
      "annotation-queue-count": false,
      "organization-member-count": false,
      "data-access-days": false,
      "model-based-evaluations-count-evaluators": false,
      "prompt-management-count-prompts": false,
    },
  },
  "cloud:enterprise": {
    entitlements: [
      ...cloudAllPlansEntitlements,
      "rbac-project-roles",
      "audit-logs",
      "data-retention",
      "cloud-multi-tenant-sso",
      "prompt-protected-labels",
      "admin-api",
    ],
    entitlementLimits: {
      "annotation-queue-count": false,
      "organization-member-count": false,
      "data-access-days": false,
      "model-based-evaluations-count-evaluators": false,
      "prompt-management-count-prompts": false,
    },
  },
  oss: {
    entitlements: selfHostedAllPlansEntitlements,
    entitlementLimits: {
      "annotation-queue-count": false,
      "organization-member-count": false,
      "data-access-days": false,
      "model-based-evaluations-count-evaluators": false,
      "prompt-management-count-prompts": false,
    },
  },
  "self-hosted:pro": {
    entitlements: selfHostedAllPlansEntitlements,
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
      ...selfHostedAllPlansEntitlements,
      "rbac-project-roles",
      "self-host-allowed-organization-creators",
      "self-host-ui-customization",
      "audit-logs",
      "data-retention",
      "prompt-protected-labels",
      "admin-api",
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
