/** types.ts contains the monitor domain — schemas, types, and the
 * `validate*` refinements consumed by the input schemas. */
import { z } from "zod";

import { singleFilter } from "../../interfaces/filters";
import { metric as MetricSchema, viewsV2 } from "../query/types";

import { isValidQuery } from "./isValidQuery";
import { isValidThresholdOrder } from "./isValidThresholdOrder";

/**
 * MonitorFiltersSchema is the array of filters applied to a Monitor's
 * underlying query — a thin alias over `singleFilter[]` so all Monitor
 * schemas reference one source of truth.
 */
export const MonitorFiltersSchema = z.array(singleFilter);
export type MonitorFilters = z.infer<typeof MonitorFiltersSchema>;

/**
 * MonitorSeveritySchema is the kebab-case wire form of Prisma's
 * `MonitorSeverity` enum. The service translates between this and Prisma at
 * the persistence boundary.
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
 * MonitorStatusSchema is the kebab-case wire form of Prisma's `MonitorStatus`
 * enum.
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
 * MonitorViewSchema is an alias of the query `viewsV2` schema.
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
 * validateThresholdOrder enforces correct warning/alert threshold ordering on
 * the Monitor input schemas.
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
 * validateQuery enforces a valid (view, metric, filters) shape on the Monitor
 * input schemas.
 */
export const validateQuery = (
  input: {
    view: z.infer<typeof viewsV2>;
    metric: z.infer<typeof MetricSchema>;
    filters: MonitorFilters;
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
 * MonitorSchema is the Monitor domain object. It mirrors the Prisma `Monitor`
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
  filters: MonitorFiltersSchema,
  metric: MetricSchema,

  // Monitor Config
  window: MonitorWindowSchema,
  thresholdOperator: MonitorThresholdOperatorSchema,
  alertThreshold: z.number(),
  warningThreshold: z.number().nullable(),
  noData: MonitorNoDataSchema.default({ mode: "SILENT" }),
  renotify: MonitorRenotifySchema.default({ mode: "OFF" }),

  // MonitorAlert Config
  name: z.string().min(1).max(200),
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
 * MonitorAlertSchema is emitted when a monitor alerts. It carries the query
 * shape (`view` / `filters` / `window`) alongside the rendered message so
 * that recipients can reconstruct the underlying observations / scores query.
 */
export const MonitorAlertSchema = z.object({
  monitorId: z.string(),
  projectId: z.string(),
  permalink: z.url(),
  message: z.object({ title: z.string(), body: z.string() }),
  severity: MonitorSeveritySchema,
  timestamp: z.coerce.date(),
  view: MonitorViewSchema,
  filters: MonitorFiltersSchema,
  window: MonitorWindowSchema,
});
export type MonitorAlert = z.infer<typeof MonitorAlertSchema>;
