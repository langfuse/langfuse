/** types.ts contains the monitor domain — schemas, types, and the
 * `validate*` refinements consumed by the input schemas. */
import {
  MonitorSeverity as PrismaMonitorSeverity,
  MonitorStatus as PrismaMonitorStatus,
  MonitorThresholdOperator as PrismaMonitorThresholdOperator,
} from "@prisma/client";
import { z } from "zod";

import { singleFilter } from "../../interfaces/filters";
import { metric as MetricSchema, viewsV2 } from "../query/types";

import { isValidQuery } from "./isValidQuery";
import { isValidThresholdOrder } from "./isValidThresholdOrder";

/** ErrorNameRequired is the message emitted when the Monitor name is missing or empty. */
export const ErrorNameRequired = "Name is a required field";

/** ErrorAlertThresholdRequired is the message emitted when alertThreshold is missing. */
export const ErrorAlertThresholdRequired =
  "Alert threshold is a required field";

/** ErrorAtLeastOneTrigger is the message emitted when a Monitor has no automations. */
export const ErrorAtLeastOneTrigger = "At least one automation is required";

/**
 * MonitorFiltersSchema is the array of filters applied to a Monitor's
 * underlying query — a thin alias over `singleFilter[]` so all Monitor
 * schemas reference one source of truth.
 */
export const MonitorFiltersSchema = z.array(singleFilter);
export type MonitorFilters = z.infer<typeof MonitorFiltersSchema>;

/** MonitorSeveritySchema is the wire form of Prisma's `MonitorSeverity` enum. */
export const MonitorSeveritySchema = z.enum(PrismaMonitorSeverity);
export type MonitorSeverity = z.infer<typeof MonitorSeveritySchema>;

/** MonitorStatusSchema is the wire form of Prisma's `MonitorStatus` enum. */
export const MonitorStatusSchema = z.enum(PrismaMonitorStatus);
export type MonitorStatus = z.infer<typeof MonitorStatusSchema>;

/** MonitorWriteStatusSchema is the subset of MonitorStatusSchema callers may submit on create/update. */
export const MonitorWriteStatusSchema = z.enum([
  PrismaMonitorStatus.ACTIVE,
  PrismaMonitorStatus.PAUSED,
]);
export type MonitorWriteStatus = z.infer<typeof MonitorWriteStatusSchema>;

/** MonitorThresholdOperatorSchema is the wire form of Prisma's `MonitorThresholdOperator` enum. */
export const MonitorThresholdOperatorSchema = z.enum(
  PrismaMonitorThresholdOperator,
);
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

/** MonitorNoDataSchema describes how a null metric value resolves to a severity. */
export const MonitorNoDataSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("AUTOMATIC") }),
  z.object({ mode: z.literal("SUBSTITUTE_ZERO") }),
  z.object({ mode: z.literal("LAST_SEVERITY") }),
  z.object({ mode: z.literal("SHOW_NO_DATA") }),
  z.object({
    mode: z.literal("NOTIFY_NO_DATA"),
    intervalMinutes: z
      .number()
      .int()
      .min(1)
      .max(60 * 24),
  }),
  z.object({ mode: z.literal("RESOLVE") }),
]);
export type MonitorNoData = z.infer<typeof MonitorNoDataSchema>;

/** validateThresholdOrder enforces correct warning/alert threshold ordering on the Monitor input schemas. */
export const validateThresholdOrder = (
  input: {
    thresholdOperator: MonitorThresholdOperator;
    alertThreshold: number;
    warningThreshold: number | null;
  },
  ctx: z.RefinementCtx,
): void => {
  const result = isValidThresholdOrder(input);
  if (!result.valid) {
    ctx.addIssue({
      code: "custom",
      message: result.reason,
      path: ["threshold"],
    });
  }
};

/** validateAtLeastOneTrigger enforces that a Monitor has at least one automation on the input schemas. */
export const validateAtLeastOneTrigger = (
  input: { triggerIds: string[] },
  ctx: z.RefinementCtx,
): void => {
  if (input.triggerIds.length < 1) {
    ctx.addIssue({
      code: "custom",
      message: ErrorAtLeastOneTrigger,
      path: ["triggerIds"],
    });
  }
};

/**
 * validateMonitorQuery enforces a valid (view, metric, filters) shape on the
 * Monitor input schemas.
 */
export const validateMonitorQuery = (
  input: {
    view: z.infer<typeof viewsV2>;
    metric: z.infer<typeof MetricSchema>;
    filters: MonitorFilters;
  },
  ctx: z.RefinementCtx,
): void => {
  const result = isValidQuery({
    view: input.view,
    metrics: [input.metric],
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
  alertThreshold: z.number({ message: ErrorAlertThresholdRequired }),
  warningThreshold: z.number().nullable(),
  noData: MonitorNoDataSchema.default({ mode: "AUTOMATIC" }),
  renotify: MonitorRenotifySchema.default({ mode: "OFF" }),

  // MonitorAlert Config
  name: z
    .string({ message: ErrorNameRequired })
    .min(1, ErrorNameRequired)
    .max(200),
  tags: z.array(z.string().max(60)).max(20).default([]),
  triggerIds: z.array(z.string()).default([]),

  // Monitor State
  severity: MonitorSeveritySchema.default("UNKNOWN"),
  severityChangedAt: z.date().nullable(),
  alertedAt: z.date().nullable(),

  // MonitorScheduler State
  status: MonitorStatusSchema.default("ACTIVE"),
  nextRunAt: z.date().nullable(),
  lastPublishedAt: z.date().nullable(),
  lastClaimedAt: z.date().nullable(),
  lastCompletedAt: z.date().nullable(),
});
export type Monitor = z.infer<typeof MonitorSchema>;

/**
 * MonitorAlertSchema is emitted when a monitor alerts.
 * It carries enough information to query events that occurred
 * during the evaluation window of the monitor.
 */
export const MonitorAlertSchema = z.object({
  monitorId: z.string(),
  projectId: z.string(),
  permalink: z.url().optional(),
  message: z.object({ title: z.string(), body: z.string() }),
  severity: MonitorSeveritySchema,
  timestamp: z.coerce.date(),
  fromTimestamp: z.coerce.date(),
  toTimestamp: z.coerce.date(),
  view: MonitorViewSchema,
  filters: MonitorFiltersSchema,
  window: MonitorWindowSchema,
});
export type MonitorAlert = z.infer<typeof MonitorAlertSchema>;
