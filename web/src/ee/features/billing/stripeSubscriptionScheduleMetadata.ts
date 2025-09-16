import { z } from "zod/v4";

/**
 * Shape of metadata set on the Stripe SubscriptionSchedule when creating a new schedule.
 * This metadata is later read by the billing webhook to process schedule events.
 *
 * Fields:
 * - orgId: optional organization identifier
 * - subscriptionId: related Stripe subscription identifier
 * - reason: why the schedule exists (plan switch or migration)
 * - newProductId: target base product identifier after the switch/migration
 * - usageProductId: target usage-based product identifier after the switch/migration
 * - switchAt: Unix timestamp when the switch should take effect
 */
export const SubscriptionScheduleMetadata = z.object({
  orgId: z.string().optional(),
  subscriptionId: z.string(),
  reason: z.union([
    z.literal("planSwitch.Downgrade"), // the user is downgrading
    z.literal("migration.scheduledMigration"), // we migrate the user to another plan
  ]),
  newProductId: z.string(),
  usageProductId: z.string(),
  switchAt: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number(v) : v)),
});

export type SubscriptionScheduleMetadata = z.infer<
  typeof SubscriptionScheduleMetadata
>;
