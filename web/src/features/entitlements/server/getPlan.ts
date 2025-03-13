import { mapStripeProductIdToPlan } from "@/src/ee/features/billing/utils/stripeProducts";
import { env } from "@/src/env.mjs";
import { type Plan } from "@langfuse/shared";
import { type CloudConfigSchema } from "@langfuse/shared";

/**
 * Get the plan of the organization based on the cloud configuration. Used to add this plan to the organization object in JWT via NextAuth.
 */
export function getOrganizationPlanServerSide(
  cloudConfig?: CloudConfigSchema,
): Plan {
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
          case "Core":
            return "cloud:core";
          case "Pro":
            return "cloud:pro";
          case "Team":
            return "cloud:team";
          case "Enterprise":
            return "cloud:enterprise";
          default:
            const exhaustiveCheck: never = cloudConfig.plan;
            throw new Error(`Unhandled plan case: ${exhaustiveCheck}`);
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

  const selfHostedPlan = getSelfHostedInstancePlanServerSide();
  if (selfHostedPlan) {
    return selfHostedPlan;
  }

  return "oss";
}

export function getSelfHostedInstancePlanServerSide(): Plan | null {
  const licenseKey = env.LANGFUSE_EE_LICENSE_KEY;
  if (!licenseKey) return null;
  if (licenseKey.startsWith("langfuse_ee_")) {
    return "self-hosted:enterprise";
  }
  if (licenseKey.startsWith("langfuse_pro_")) {
    return "self-hosted:pro";
  }
  return null;
}
