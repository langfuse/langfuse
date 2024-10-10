import { type Plan } from "@langfuse/shared";
import { type User } from "next-auth";

export type FeatureBasedEntitlement =
  | "playground"
  | "model-based-evaluations"
  | "rbac-project-roles"
  | "cloud-billing"
  | "integration-posthog"
  | "batch-export";

export type UsageBasedEntitlement = "annotation-queues";

export type Entitlement = FeatureBasedEntitlement | UsageBasedEntitlement;

type BaseEntitlementParams = {
  sessionUser: User;
  isViewOnly?: boolean;
} & ({ projectId: string } | { orgId: string });

export type HasEntitlementParams = BaseEntitlementParams & {
  entitlement: Entitlement;
};

export type EntitlementAccess = {
  features: FeatureBasedEntitlement[];
  usageBasedFeatures: {
    [key in UsageBasedEntitlement]: number | true; // Allow 'true' for unlimited usage
  };
};

const cloudAllPlansEntitlements: FeatureBasedEntitlement[] = [
  "playground",
  "model-based-evaluations",
  "cloud-billing",
  "integration-posthog",
  "batch-export",
];

export const entitlementAccess: Record<Plan, EntitlementAccess> = {
  oss: {
    features: [],
    usageBasedFeatures: {
      "annotation-queues": 0, // No usage allowed
    },
  },
  "cloud:hobby": {
    features: cloudAllPlansEntitlements,
    usageBasedFeatures: {
      "annotation-queues": 2, // Limited usage
    },
  },
  "cloud:pro": {
    features: cloudAllPlansEntitlements,
    usageBasedFeatures: {
      "annotation-queues": true, // Unlimited usage
    },
  },
  "cloud:team": {
    features: [...cloudAllPlansEntitlements, "rbac-project-roles"],
    usageBasedFeatures: {
      "annotation-queues": true, // Unlimited usage
    },
  },
  "self-hosted:enterprise": {
    features: [
      "playground",
      "rbac-project-roles",
      // `LANGFUSE_ALLOWED_ORGANIZATION_CREATORS` -> directly checked on instance level in auth.ts
    ],
    usageBasedFeatures: {
      "annotation-queues": true, // No usage allowed
    },
  },
};

// Define usage checking functions for each usage-based entitlement
export const usageCheckers: {
  [key in UsageBasedEntitlement]: (orgId: string) => Promise<number>;
} = {
  "annotation-queues": async (orgId: string) => {
    // Implement the logic to get the current usage for annotation queues
    // This is just a placeholder, replace with actual implementation
    return 0;
  },
};
