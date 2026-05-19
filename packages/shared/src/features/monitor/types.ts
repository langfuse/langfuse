/** types.ts contains all entity models and logic */
import {
  MonitorSeverity,
  MonitorStatus,
  MonitorThresholdOperator,
  MonitorView,
} from "@prisma/client";
import { z } from "zod";
import { singleFilter } from "../../interfaces/filters";
import { metric as MetricSchema } from "../query/types";
import { DAY, HOUR, MINUTE, WEEK } from "./internal";
import { validateMonitorTemplate } from "./template";

/**
 * ErrorInvalidMonitorWindow is emitted when a `window`
 * value does not match any `MonitorWindow.*` tier.
 */
export const ErrorInvalidMonitorWindow =
  "window must be one of the MonitorWindow.* tiers";

/**
 * ErrorInvalidWarningAlertOrdering is emitted when `warningThreshold` is more severe
 * than `alertThreshold` for a given `thresholdOperator`.
 */
export const ErrorInvalidWarningAlertOrdering =
  "warningThreshold must be less severe than alertThreshold for ordered operators";

/**
 * ErrorInvalidMonitorTemplate is emitted when a message template references
 * unknown variables, uses helpers, partials, decorators, sub-expressions, or
 * unescaped `{{{x}}}` output, or fails to parse as Handlebars.
 */
export const ErrorInvalidMonitorTemplate =
  "template is not formatted correctly";

/**
 * MonitorWindow contains the list of allowed Monitor evaluation windows.
 * Adding a tier requires updating `monitorWindowCadenceMs`.
 */
export const MonitorWindow = {
  FIVE_MIN: 5n * MINUTE,
  TEN_MIN: 10n * MINUTE,
  FIFTEEN_MIN: 15n * MINUTE,
  THIRTY_MIN: 30n * MINUTE,
  ONE_HOUR: HOUR,
  TWO_HOUR: 2n * HOUR,
  FOUR_HOUR: 4n * HOUR,
  ONE_DAY: DAY,
  TWO_DAY: 2n * DAY,
  ONE_WEEK: WEEK,
} as const;

/**
 * calculateMonitorWindowCadenceMs derives a Monitor's scheduler cadence from its evaluation window.
 */
export function calculateMonitorWindowCadenceMillis(
  windowMillis: bigint,
): bigint {
  if (windowMillis >= WEEK) return 48n * HOUR;
  if (windowMillis >= DAY) return 30n * MINUTE;
  return MINUTE; // default cadence
}

/**
 * isValidMonitorWindow returns true when `v` matches one of the `MonitorWindow.*` tiers.
 */
export const isValidMonitorWindow = (v: bigint): boolean =>
  (Object.values(MonitorWindow) as bigint[]).includes(v);

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
 * validateWarningAlertOrdering enforces that warning must cross before alert
 * for ordered operators; null warning and unordered operators (EQ/NEQ) always
 * pass.
 */
export function validateWarningAlertOrdering(monitor: {
  thresholdOperator: MonitorThresholdOperator;
  alertThreshold: number;
  warningThreshold: number | null;
}): boolean {
  if (monitor.warningThreshold == null) return true;
  switch (monitor.thresholdOperator) {
    case "GT":
    case "GTE":
      return monitor.warningThreshold < monitor.alertThreshold;
    case "LT":
    case "LTE":
      return monitor.warningThreshold > monitor.alertThreshold;
    case "EQ":
    case "NEQ":
      return true;
  }
}

/**
 * MonitorSchema is the canonical Monitor object. Mirrors the Prisma `Monitor`
 * row.
 *
 * `cadenceMs` is derived from `window` on write and intentionally not
 * exposed here.
 *
 * The Prisma column `windowMs` maps to this schema's `window`
 * at the service boundary.
 */
export const MonitorSchema = z
  .object({
    id: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    createdBy: z.string().nullable(),
    updatedBy: z.string().nullable(),
    projectId: z.string(),

    // Query Config
    view: z.enum(MonitorView),
    filters: z.array(singleFilter),
    metric: MetricSchema,

    // Monitor Config
    window: z.bigint().refine(isValidMonitorWindow, ErrorInvalidMonitorWindow),
    thresholdOperator: z.enum(MonitorThresholdOperator),
    alertThreshold: z.number(),
    warningThreshold: z.number().nullable(),
    noData: MonitorNoDataSchema.default({ mode: "SILENT" }),
    renotify: MonitorRenotifySchema.default({ mode: "OFF" }),

    // MonitorAlert Config
    name: z
      .string()
      .min(1)
      .max(200)
      .refine(validateMonitorTemplate, ErrorInvalidMonitorTemplate),
    message: z
      .string()
      .max(2000)
      .refine(validateMonitorTemplate, ErrorInvalidMonitorTemplate)
      .default(""),
    tags: z.array(z.string().max(60)).max(20).default([]),

    // Monitor State
    severity: z.enum(MonitorSeverity).default("UNKNOWN"),
    severityChangedAt: z.date().nullable(),
    alertedAt: z.date().nullable(),

    // MonitorScheduler State
    status: z.enum(MonitorStatus).default("ACTIVE"),
    nextRunAt: z.date(),
    lastPublishedRunAt: z.date().nullable(),
    lastCompletedRunAt: z.date().nullable(),
  })
  .refine(validateWarningAlertOrdering, {
    message: ErrorInvalidWarningAlertOrdering,
    path: ["warningThreshold"],
  });

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
  view: z.enum(MonitorView),
  filters: z.array(singleFilter),
  window: z.coerce
    .bigint()
    .refine(isValidMonitorWindow, ErrorInvalidMonitorWindow),
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
  severity: z.enum(MonitorSeverity),
  timestamp: z.coerce.date(),
  view: z.enum(MonitorView),
  filters: z.array(singleFilter),
  window: z.coerce
    .bigint()
    .refine(isValidMonitorWindow, ErrorInvalidMonitorWindow),
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
