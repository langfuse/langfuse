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

  // billing alert configuration
  usageAlerts: z
    .object({
      enabled: z.boolean().default(true),
      type: z.enum(["STRIPE"]).default("STRIPE"),
      threshold: z.number().int().positive(),
      alertId: z.string(), // Alert ID for tracking
      meterId: z.string(), // Meter ID for usage tracking
      notifications: z.object({
        email: z.boolean().default(true),
        recipients: z.array(z.string().email()).default([]),
      }),
    })
    .optional(),
});

export type CloudConfigSchema = z.infer<typeof CloudConfigSchema>;
