import { z } from "zod/v4";
import { CloudConfigRateLimit } from "./rate-limits";
import { cloudConfigPlans } from "../features/entitlements/plans";

export const CloudConfigSchema = z.object({
  plan: z.enum(cloudConfigPlans).optional(),
  monthlyObservationLimit: z.number().int().positive().optional(),
  // used for table and dashboard queries
  defaultLookBackDays: z.number().int().positive().optional(),
  // need to update stripe webhook if you change this, it fetches from db via these fields
  stripe: z
    .object({
      customerId: z.string().optional(),
      activeSubscriptionId: z.string().optional(),
      activeProductId: z.string().optional(),
      activeUsageProductId: z.string().optional(),
      subscriptionStatus: z.string().optional(), // should be one of ["active","past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]; we don't enforce to have a backwards compatibility for this field
    })
    .transform((data) => ({
      ...data,
      isLegacySubscription:
        data?.activeProductId !== undefined &&
        data?.activeUsageProductId === undefined,
    }))
    .optional(),

  // custom rate limits for an organization
  rateLimitOverrides: CloudConfigRateLimit.optional(),
});

export type CloudConfigSchema = z.infer<typeof CloudConfigSchema>;
