import { z } from "zod";
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
      customerId: z.string().nullish(),
      activeSubscriptionId: z.string().nullish(),
      activeProductId: z.string().nullish(),
      activeUsageProductId: z.string().nullish(),
      subscriptionStatus: z.string().nullish(), // should be one of ["active","past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]; we don't enforce to have a backwards compatibility for this field
    })
    .transform((data) => ({
      ...data,
      isLegacySubscription:
        data?.activeProductId != null && data?.activeUsageProductId == null,
    }))
    .nullish(),

  // ClickHouse Billing (CHB) state. Written only by the CHB webhook handler,
  // except organizationId which checkout-session creation persists. Invariant:
  // an org carries either `stripe` billing state or `clickhouse` state, never
  // both — provider routing (getBillingProvider) and the worker jobs'
  // Stripe-customer-id selection depend on it.
  clickhouse: z
    .object({
      // ClickHouse Organization ID. Required and uuid-validated: parseDbOrg
      // nulls the whole cloudConfig on parse failure, so strictness here is
      // only safe because both writers (checkout response, webhook handler)
      // validate the uuid before persisting. Change the stored schema first,
      // writers second, if the id format ever loosens.
      organizationId: z.uuid(),
      bundleId: z.string().nullish(),
      planCode: z.string().nullish(), // "core" | "pro" | "team" | "enterprise"; kept loose like stripe.subscriptionStatus
      paymentStatus: z.string().nullish(), // "active" | "failed" | ...
      nextPaymentDate: z.string().nullish(),
      // Stripe customer behind the CHB bundle (payment.provider.customerId on
      // bundle.* events). Support tooling only — routing, plan resolution, and
      // the worker jobs never read it.
      stripeCustomerId: z.string().nullish(),
      // Snapshot of a pending scheduled change (downgrade/cancel) for the UI.
      scheduled: z
        .object({
          type: z.string(), // "upgrade" | "downgrade" | "cancel"
          when: z.string(), // "immediate" | "billing_cycle_end" | ISO date
          planCode: z.string().nullish(),
          startDate: z.string().nullish(),
        })
        .nullish(),
      // Monotonic guard against out-of-order webhook delivery.
      lastEventCreatedAt: z.string().nullish(),
    })
    .nullish(),

  // custom rate limits for an organization
  rateLimitOverrides: CloudConfigRateLimit.optional(),
});

export type CloudConfigSchema = z.infer<typeof CloudConfigSchema>;
