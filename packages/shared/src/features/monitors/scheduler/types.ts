import { z } from "zod";

import { metric as MetricSchema } from "../../query/types";

import {
  MonitorAlertSchema,
  MonitorFiltersSchema,
  MonitorViewSchema,
  MonitorWindowSchema,
} from "../types";

/** MonitorQueueEventSchema validates a batch of monitors evaluated together with shared query parameters. */
export const MonitorQueueEventSchema = z.object({
  projectId: z.string(),
  // Fingerprint of (projectId, view, filters, window).
  schedulerBatchId: z.coerce.bigint().nonnegative(),

  // CH window anchor.
  runAt: z.coerce.date(),

  // Publish identifier for the processor's claim/complete CAS.
  publishedAt: z.coerce.date(),

  view: MonitorViewSchema,
  filters: MonitorFiltersSchema,
  window: MonitorWindowSchema,
  metrics: z.array(MetricSchema),

  monitors: z.array(
    z.object({ monitorId: z.string(), metricName: z.string() }),
  ),
});

/** MonitorQueueEvent is the parsed shape of MonitorQueueEventSchema. */
export type MonitorQueueEvent = z.infer<typeof MonitorQueueEventSchema>;

/** MonitorQueueEventInput is the unparsed input shape of MonitorQueueEventSchema. */
export type MonitorQueueEventInput = z.input<typeof MonitorQueueEventSchema>;

/** MonitorWebhookQueueEventSchema validates the envelope published onto WebhookQueue and posted to customer webhooks. */
export const MonitorWebhookQueueEventSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  type: z.literal("monitor-alert"),
  apiVersion: z.literal("v1"),
  payload: MonitorAlertSchema,
});

/** MonitorWebhookQueueEvent is the parsed shape of MonitorWebhookQueueEventSchema. */
export type MonitorWebhookQueueEvent = z.infer<
  typeof MonitorWebhookQueueEventSchema
>;

/** MonitorWebhookInput is the routing head plus monitor envelope the processor publishes onto WebhookQueue. */
export type MonitorWebhookInput = {
  projectId: string;
  automationId: string;
  executionId: string;
  payload: MonitorWebhookQueueEvent;
};
