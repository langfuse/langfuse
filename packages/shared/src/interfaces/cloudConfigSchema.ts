import { z } from "zod";
import { CloudConfigRateLimit } from "./rate-limits";

export const CloudConfigSchema = z.object({
  plan: z.enum(["Hobby", "Pro", "Team", "Enterprise"]).optional(),
  monthlyObservationLimit: z.number().int().positive().optional(),
  // used for table and dashboard queries
  defaultLookBackDays: z.number().int().positive().optional(),
  // need to update stripe webhook if you change this, it fetches from db via these fields
  stripe: z
    .object({
      customerId: z.string().optional(),
      activeSubscriptionId: z.string().optional(),
      activeProductId: z.string().optional(),
    })
    .optional(),

  // custom rate limits for an organization
  rateLimitOverrides: CloudConfigRateLimit.optional(),
});

export type CloudConfigSchema = z.infer<typeof CloudConfigSchema>;
