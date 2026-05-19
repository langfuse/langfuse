/**
 * DTOs and ports for the future Monitor Queue Processor.
 *
 * The processor reads `MonitorQueueEvent` batches, evaluates each Monitor
 * against ClickHouse, and publishes a `MonitorAlertWebhookPublishInput` to
 * the WebhookQueue for every Monitor that crossed a threshold. The outbound
 * HTTP payload posted to a customer-configured webhook URL is shaped by
 * `MonitorAlertWebhookOutboundSchema`.
 */
import { z } from "zod";

import { MonitorAlertSchema, MonitorWebhookQueueEventSchema } from "../types";

/**
 * MonitorAlertWebhookOutboundSchema is the JSON payload posted to a
 * customer-configured webhook URL when a Monitor alerts. `payload.window`
 * is stringified because the rest of the system carries `window` as a
 * `bigint` (cheap arithmetic, exact ms) and `bigint` has no JSON
 * representation.
 */
export const MonitorAlertWebhookOutboundSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  type: z.literal("monitor-alert"),
  apiVersion: z.literal("v1"),
  payload: MonitorAlertSchema.omit({ window: true }).extend({
    window: z.bigint().transform((v) => v.toString()),
  }),
});

export type MonitorAlertWebhookOutput = z.infer<
  typeof MonitorAlertWebhookOutboundSchema
>;

/**
 * MonitorAlertWebhookPublishInputSchema is the DTO the Monitor Queue
 * Processor pushes onto the WebhookQueue for each Monitor that fired.
 * It matches `WebhookInputSchema` narrowed to the `monitor-alert` variant
 * so the existing webhook worker can consume it without a separate queue.
 */
export const MonitorAlertWebhookPublishInputSchema = z.object({
  projectId: z.string(),
  automationId: z.string(),
  executionId: z.string(),
  payload: MonitorWebhookQueueEventSchema,
});

export type MonitorAlertWebhookPublishInput = z.infer<
  typeof MonitorAlertWebhookPublishInputSchema
>;
