/** types.ts contains all entity models and logic */
import { z } from "zod";
import { singleFilter } from "../../../interfaces/filters";
import { metric as MetricSchema, viewsV2 } from "../../../features/query/types";
import { isValidQuery } from "./isValidQuery";
import { isValidTemplate } from "./isValidTemplate";

/**
 * isValidThresholdOrder returns true if order of the alert and warning
 * thresholds are correct based on the operator
 */
const isValidThresholdOrder = (monitor: {
  thresholdOperator: MonitorThresholdOperator;
  alertThreshold: number;
  warningThreshold: number | null;
}): boolean => {
  if (monitor.warningThreshold == null) return true;
  switch (monitor.thresholdOperator) {
    case "gt":
    case "gte":
      return monitor.warningThreshold > monitor.alertThreshold;
    case "lt":
    case "lte":
      return monitor.warningThreshold < monitor.alertThreshold;
    case "eq":
    case "neq":
      return true;
  }
};

/**
 * validateThresholdOrder enforces the correct order of the thresholds
 * set in the MonitorSchema
 */
export const validateThresholdOrder = (
  input: {
    thresholdOperator: MonitorThresholdOperator;
    alertThreshold: number;
    warningThreshold: number | null;
  },
  ctx: z.RefinementCtx,
): void => {
  if (!isValidThresholdOrder(input)) {
    ctx.addIssue({
      code: "custom",
      message: `alertThreshold must be ${input.thresholdOperator} warningThreshold`,
      path: ["threshold"],
    });
  }
};

/**
 * validateQuery enforces the correct query schema of the MonitorSchema.
 */
export const validateQuery = (
  input: {
    view: z.infer<typeof ViewsV2Schema>;
    metric: z.infer<typeof MetricSchema>;
    filters: z.infer<typeof singleFilter>[];
  },
  ctx: z.RefinementCtx,
): void => {
  const result = isValidQuery({
    view: input.view,
    metric: input.metric,
    filters: input.filters,
  });
  if (!result.valid) {
    ctx.addIssue({
      code: "custom",
      message: result.reason,
      path: ["query"],
    });
  }
};

/**
 * validateTemplate validates template strings
 */
export const validateTemplate = (template: string, ctx: z.RefinementCtx) => {
  if (!isValidTemplate(template)) {
    ctx.addIssue({
      code: "custom",
      message: "message template is not valid",
      path: ["query"],
    });
  }
};

/**
 * MonitorSeveritySchema is the kebab-case wire form of Prisma's `MonitorSeverity`
 * enum. The service translates between this and Prisma at the persistence
 * boundary.
 */
export const MonitorSeveritySchema = z.enum([
  "unknown",
  "ok",
  "warning",
  "alert",
  "no-data",
]);
export type MonitorSeverity = z.infer<typeof MonitorSeveritySchema>;

/**
 * MonitorStatusSchema is the kebab-case wire form of Prisma's `MonitorStatus` enum.
 */
export const MonitorStatusSchema = z.enum([
  "active",
  "paused",
  "error-bad-query",
]);
export type MonitorStatus = z.infer<typeof MonitorStatusSchema>;

/**
 * MonitorThresholdOperatorSchema is the kebab-case wire form of Prisma's
 * `MonitorThresholdOperator` enum.
 */
export const MonitorThresholdOperatorSchema = z.enum([
  "gt",
  "gte",
  "lt",
  "lte",
  "eq",
  "neq",
]);
export type MonitorThresholdOperator = z.infer<
  typeof MonitorThresholdOperatorSchema
>;

/**
 * MonitorWindowSchema is the kebab-case wire form of a Monitor evaluation
 * window. The service translates between this and a bigint of milliseconds
 * (the Prisma `windowMs` column) at the persistence boundary.
 */
export const MonitorWindowSchema = z.enum([
  "5m",
  "10m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "1d",
  "2d",
  "1w",
]);
export type MonitorWindow = z.infer<typeof MonitorWindowSchema>;

/**
 * MonitorViewSchema is an alias of the query viewsV2 schema
 */
export const MonitorViewSchema = viewsV2;
export type MonitorView = z.infer<typeof MonitorViewSchema>;

/**
 * MonitorRenotifySchema describes renotify behavior for a sustained severity.
 * `OFF` is edge-only; `EVERY` re-emits every `intervalMinutes` while the
 * severity persists.
 */
export const MonitorRenotifySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("OFF") }),
  z.object({
    mode: z.literal("EVERY"),
    intervalMinutes: z
      .number()
      .int()
      .min(1)
      .max(60 * 24 * 7),
  }),
]);
export type MonitorRenotify = z.infer<typeof MonitorRenotifySchema>;

/**
 * MonitorNoDataSchema describes behavior when a Monitor query returns no rows.
 * `SILENT` only alerts on recovery; `NOTIFY` also alerts after
 * `intervalMinutes` of sustained NO_DATA.
 */
export const MonitorNoDataSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("SILENT") }),
  z.object({
    mode: z.literal("NOTIFY"),
    intervalMinutes: z
      .number()
      .int()
      .min(1)
      .max(60 * 24),
  }),
]);
export type MonitorNoData = z.infer<typeof MonitorNoDataSchema>;

/**
 * MonitorSchema is the Monitor domiain object. It mirrors the Prisma `Monitor`
 * row.
 */
export const MonitorSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  projectId: z.string(),

  // Query Config
  view: MonitorViewSchema,
  filters: z.array(singleFilter),
  metric: MetricSchema,

  // Monitor Config
  window: MonitorWindowSchema,
  thresholdOperator: MonitorThresholdOperatorSchema,
  alertThreshold: z.number(),
  warningThreshold: z.number().nullable(),
  noData: MonitorNoDataSchema.default({ mode: "SILENT" }),
  renotify: MonitorRenotifySchema.default({ mode: "OFF" }),

  // MonitorAlert Config
  name: z.string().min(1).max(200).superRefine(validateTemplate),
  message: z.string().max(2000).superRefine(validateTemplate).default(""),
  tags: z.array(z.string().max(60)).max(20).default([]),

  // Monitor State
  severity: MonitorSeveritySchema.default("unknown"),
  severityChangedAt: z.date().nullable(),
  alertedAt: z.date().nullable(),

  // MonitorScheduler State
  status: MonitorStatusSchema.default("active"),
  nextRunAt: z.date(),
  lastPublishedRunAt: z.date().nullable(),
  lastCompletedRunAt: z.date().nullable(),
});
export type Monitor = z.infer<typeof MonitorSchema>;

/**
 * MonitorQueueEventSchema represents a batch of monitors that can be evaluated
 * together using the same set of parameters.
 *
 * All monitors in `monitors[]` share `view` / `filters` /
 * `window`, so the worker runs one ClickHouse query for the whole batch.
 */
export const MonitorQueueEventSchema = z.object({
  projectId: z.string(),
  // Fingerprint of (projectId, view, filters, window)
  schedulerBatchId: z.coerce.bigint(),

  // Scheduler tick time
  scheduledAt: z.coerce.date(),

  // Shared query primitives — every monitor in this batch agrees on these.
  view: MonitorViewSchema,
  filters: z.array(singleFilter),
  window: MonitorWindowSchema,
  metrics: z.array(MetricSchema),

  // Monitors map to metricNames returned by the above query params
  monitors: z.array(
    z.object({ monitorId: z.string(), metricName: z.string() }),
  ),
});
export type MonitorQueueEvent = z.infer<typeof MonitorQueueEventSchema>;

/**
 * MonitorAlertSchema is emitted when a monitor alerts.
 * It carries the query shape (`view` / `filters` / `window`) alongside the
 * rendered message so that recipients can reconstruct the underlying observations / scores query.
 */
export const MonitorAlertSchema = z.object({
  monitorId: z.string(),
  projectId: z.string(),
  permalink: z.url(),
  message: z.object({ title: z.string(), body: z.string() }),
  severity: MonitorSeveritySchema,
  timestamp: z.coerce.date(),
  view: MonitorViewSchema,
  filters: z.array(singleFilter),
  window: MonitorWindowSchema,
});
export type MonitorAlert = z.infer<typeof MonitorAlertSchema>;

/**
 * MonitorWebhookQueueEventSchema is the transport envelope wrapping
 * `MonitorAlertSchema` for the `WebhookQueue`.
 */
export const MonitorWebhookQueueEventSchema = z.object({
  type: z.literal("monitor-alert"),
  version: z.literal("v1"),
  payload: MonitorAlertSchema,
});
export type MonitorWebhookQueueEvent = z.infer<
  typeof MonitorWebhookQueueEventSchema
>;
