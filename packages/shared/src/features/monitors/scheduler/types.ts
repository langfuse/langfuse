/** scheduler/types.ts contains the transport DTOs the scheduler/worker
 * publish on BullMQ. These are wire-shaped (coerced primitives) and not
 * domain entities. */
import { z } from "zod";

import { metric as MetricSchema } from "../../query/types";

import {
  MonitorAlertSchema,
  MonitorFiltersSchema,
  MonitorViewSchema,
  MonitorWindowSchema,
} from "../types";

/**
 * MonitorQueueEventSchema represents a batch of monitors that can be
 * evaluated together using the same set of parameters.
 *
 * All monitors in `monitors[]` share `view` / `filters` / `window`, so the
 * worker runs one ClickHouse query for the whole batch.
 */
export const MonitorQueueEventSchema = z.object({
  projectId: z.string(),
  // Fingerprint of (projectId, view, filters, window)
  schedulerBatchId: z.coerce.bigint().nonnegative(),

  // Deterministic run boundary this batch represents. CH window anchor.
  runAt: z.coerce.date(),

  // Wallclock at which the scheduler published this event. Publish identifier
  // for the processor's claim/complete CAS.
  publishedAt: z.coerce.date(),

  // Shared query primitives — every monitor in this batch agrees on these.
  view: MonitorViewSchema,
  filters: MonitorFiltersSchema,
  window: MonitorWindowSchema,
  metrics: z.array(MetricSchema),

  // Monitors map to metricNames returned by the above query params
  monitors: z.array(
    z.object({ monitorId: z.string(), metricName: z.string() }),
  ),
});
/** MonitorQueueEvent is the parsed/domain shape — schedulerBatchId is a bigint. */
export type MonitorQueueEvent = z.infer<typeof MonitorQueueEventSchema>;

/** MonitorQueueEventWire is the unparsed wire shape — schedulerBatchId is string|number|bigint. Producers (the scheduler) emit this; consumers parse to MonitorQueueEvent. Keeps BullMQ JSON.stringify safe. */
export type MonitorQueueEventWire = z.input<typeof MonitorQueueEventSchema>;

/**
 * MonitorWebhookQueueEventSchema is the unified envelope: it's both the BullMQ
 * payload the MonitorProcessor publishes onto `WebhookQueue` and the HTTP body
 * the dispatcher posts to customer webhooks. `id` is the executionId and
 * `timestamp` is publish-time wallclock — both stable across BullMQ retries
 * so consumers can dedupe.
 */
export const MonitorWebhookQueueEventSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  type: z.literal("monitor-alert"),
  apiVersion: z.literal("v1"),
  payload: MonitorAlertSchema,
});
export type MonitorWebhookQueueEvent = z.infer<
  typeof MonitorWebhookQueueEventSchema
>;
