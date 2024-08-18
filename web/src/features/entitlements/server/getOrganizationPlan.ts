import { mapStripeProductIdToPlan } from "@/src/ee/features/billing/utils/stripeProducts";
import { env } from "@/src/env.mjs";
import { type Plan } from "@/src/features/entitlements/constants/plans";
import { type CloudConfigSchema } from "@langfuse/shared";

/**
 * Get the plan of the organization based on the cloud configuration. Used to add this plan to the organization object in JWT via NextAuth.
 */
export function getOrganizationPlan(cloudConfig?: CloudConfigSchema): Plan {
  if (process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    // in dev, grant team plan to all organizations
    // if (process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV") {
    //   return "cloud:team";
    // }
    if (cloudConfig) {
      // manual plan override
      if (cloudConfig.plan) {
        switch (cloudConfig.plan) {
          case "Hobby":
            return "cloud:hobby";
          case "Pro":
            return "cloud:pro";
          case "Team":
          case "Enterprise":
            return "cloud:team";
        }
      }
      // stripe plan via product id
      if (cloudConfig.stripe?.activeProductId) {
        const stripePlan = mapStripeProductIdToPlan(
          cloudConfig.stripe.activeProductId,
        );
        if (stripePlan) {
          return stripePlan;
        }
      }
    }
    return "cloud:hobby";
  }

  if (env.LANGFUSE_EE_LICENSE_KEY !== undefined)
    return "self-hosted:enterprise";

  return "oss";
}
