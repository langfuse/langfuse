/** MonitorService.ts contains the monitor service and its helper funcitons */
import {
  MonitorSeverity as PrismaMonitorSeverity,
  MonitorStatus as PrismaMonitorStatus,
  MonitorThresholdOperator as PrismaMonitorThresholdOperator,
  MonitorView as PrismaMonitorView,
} from "@prisma/client";
import { z } from "zod";
import { paginationZod } from "../../../utils/zod";
import { orderBy } from "../../../interfaces/orderBy";

import { Prisma, prisma } from "../../../db";
import { InvalidRequestError } from "../../../errors";
import { viewsV2 } from "../../../features/query/types";
import type {
  Monitor,
  MonitorSeverity,
  MonitorStatus,
  MonitorThresholdOperator,
  MonitorWindow,
  MonitorView,
} from "./types";
import { MonitorSchema, validateQuery, validateThresholdOrder } from "./types";
import {
  calculateLastRunAt,
  calculateSchedulerBatchId,
  sortFiltersCanonically,
  calculateCadence,
} from "./internal";

/**
 * MonitorService manages all of the Monitors that produce
 * MonitorAlerts on the system.
 *
 * It nomalizes data, calculates derived properties, and persists data
 * to the Prisma repository.
 *
 * Validation is handeled directly by the zod schema found in types.ts.
 * Services assume the inputs have been parsed and validated by trpc or
 * other api adapters.
 */
export class MonitorService {
  public static async create(input: CreateMonitorInput): Promise<Monitor> {
    const filters = sortFiltersCanonically(input.filters);
    const windowMs = windowToMs(input.window);
    const cadenceMs = calculateCadence(windowMs);
    const schedulerBatchId = calculateSchedulerBatchId({
      projectId: input.projectId,
      view: input.view,
      filters,
      windowMs,
    });
    const nextRunAt = calculateLastRunAt(
      new Date(),
      cadenceMs,
      schedulerBatchId,
    );

    const created = await prisma.monitor.create({
      data: {
        projectId: input.projectId,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
        view: viewToPrisma(input.view),
        filters,
        metric: input.metric,
        windowMs,
        cadenceMs,
        thresholdOperator: thresholdOperatorToPrisma(input.thresholdOperator),
        alertThreshold: new Prisma.Decimal(input.alertThreshold),
        warningThreshold: decimalToPrisma(input.warningThreshold),
        noData: input.noData,
        renotify: input.renotify,
        status: statusToPrisma(input.status),
        schedulerBatchId,
        nextRunAt,
        name: input.name,
        message: input.message,
        tags: input.tags,
      },
    });
    return monitorFromPrisma(created);
  }

  public static async update(input: UpdateMonitorInput): Promise<Monitor> {
    const filters = sortFiltersCanonically(input.filters);
    const windowMs = windowToMs(input.window);
    const cadenceMs = calculateCadence(windowMs);
    const schedulerBatchId = calculateSchedulerBatchId({
      projectId: input.projectId,
      view: input.view,
      filters,
      windowMs,
    });
    const nextRunAt = calculateLastRunAt(
      new Date(),
      cadenceMs,
      schedulerBatchId,
    );

    // Scheduler and QueueProcessor columns are intentionally not touched
    // (eg. severity, severityChangedAt, alertedAt, lastPublishedRunAt, lastCompletedRunAt).
    try {
      const updated = await prisma.monitor.update({
        where: { id: input.id, projectId: input.projectId },
        data: {
          updatedBy: input.updatedBy,
          view: viewToPrisma(input.view),
          filters,
          metric: input.metric,
          windowMs,
          cadenceMs,
          thresholdOperator: thresholdOperatorToPrisma(input.thresholdOperator),
          alertThreshold: new Prisma.Decimal(input.alertThreshold),
          warningThreshold: decimalToPrisma(input.warningThreshold),
          noData: input.noData,
          renotify: input.renotify,
          status: statusToPrisma(input.status),
          schedulerBatchId,
          nextRunAt,
          name: input.name,
          message: input.message,
          tags: input.tags,
        },
      });
      return monitorFromPrisma(updated);
    } catch (e) {
      throw errorFromPrisma(input.id, input.projectId, e);
    }
  }

  public static async getById(
    monitorId: string,
    projectId: string,
  ): Promise<Monitor | null> {
    const monitor = await prisma.monitor.findFirst({
      where: { id: monitorId, projectId },
    });
    return monitor ? monitorFromPrisma(monitor) : null;
  }

  public static async list(
    input: MonitorListInput,
  ): Promise<{ monitors: Monitor[]; totalCount: number }> {
    const skip =
      input.page && input.limit ? (input.page - 1) * input.limit : undefined;

    const [monitors, totalCount] = await Promise.all([
      prisma.monitor.findMany({
        where: { projectId: input.projectId },
        orderBy: input.orderBy
          ? [{ [input.orderBy.column]: input.orderBy.order.toLowerCase() }]
          : [{ updatedAt: "desc" }],
        skip,
        take: input.limit,
      }),
      prisma.monitor.count({ where: { projectId: input.projectId } }),
    ]);

    return { monitors: monitors.map(monitorFromPrisma), totalCount };
  }

  public static async delete(
    monitorId: string,
    projectId: string,
  ): Promise<void> {
    try {
      await prisma.monitor.delete({
        where: { id: monitorId, projectId },
      });
    } catch (e) {
      throw errorFromPrisma(monitorId, projectId, e);
    }
  }
}

/** omitOnWrite are a list of properties that should be omitted from all write DTOs */
const omitOnWrite = {
  createdAt: true,
  updatedAt: true,
  severity: true,
  severityChangedAt: true,
  alertedAt: true,
  nextRunAt: true,
  lastPublishedRunAt: true,
  lastCompletedRunAt: true,
} as const;

/**
 * CreateMonitorInputSchema is the input contract for `MonitorService.create`.
 * The caller supplies `createdBy`; the service mirrors it onto `updatedBy`.
 */
export const CreateMonitorInputSchema = MonitorSchema.omit({
  ...omitOnWrite,
  id: true,
  updatedBy: true,
})
  .superRefine(validateQuery)
  .superRefine(validateThresholdOrder);
export type CreateMonitorInput = z.infer<typeof CreateMonitorInputSchema>;

/**
 * UpdateMonitorInputSchema is the input contract for `MonitorService.update`.
 * The caller supplies `id` (target row) and `updatedBy`; `createdBy` is
 * preserved from the existing row.
 */
export const UpdateMonitorInputSchema = MonitorSchema.omit({
  ...omitOnWrite,
  createdBy: true,
})
  .superRefine(validateQuery)
  .superRefine(validateThresholdOrder);
export type UpdateMonitorInput = z.infer<typeof UpdateMonitorInputSchema>;

/**
 * MonitorListInputSchema is the input contract for `MonitorService.list`.
 * `orderBy` is constrained to the columns the admin table can sort on; null
 * falls back to the service default (`updatedAt DESC`).
 */
export const MonitorListInputSchema = z.object({
  projectId: z.string(),
  orderBy: orderBy,
  ...paginationZod,
});
export type MonitorListInput = z.infer<typeof MonitorListInputSchema>;

/** viewToPrisma converts the query api value to the Prisma MonitorView enum. */
const viewToPrisma = (view: z.infer<typeof viewsV2>): PrismaMonitorView => {
  switch (view) {
    case "observations":
      return PrismaMonitorView.OBSERVATIONS;
    case "scores-numeric":
      return PrismaMonitorView.SCORES_NUMERIC;
    case "scores-categorical":
      return PrismaMonitorView.SCORES_CATEGORICAL;
  }
};

/** viewFromPrisma converts the Prisma MonitorView enum to the query api enum. */
const viewFromPrisma = (view: PrismaMonitorView): MonitorView => {
  switch (view) {
    case PrismaMonitorView.OBSERVATIONS:
      return "observations";
    case PrismaMonitorView.SCORES_NUMERIC:
      return "scores-numeric";
    case PrismaMonitorView.SCORES_CATEGORICAL:
      return "scores-categorical";
  }
};

/** severityFromPrisma converts the Prisma MonitorSeverity enum to the monitorSeverity api enum. */
const severityFromPrisma = (s: PrismaMonitorSeverity): MonitorSeverity => {
  switch (s) {
    case PrismaMonitorSeverity.UNKNOWN:
      return "unknown";
    case PrismaMonitorSeverity.OK:
      return "ok";
    case PrismaMonitorSeverity.WARNING:
      return "warning";
    case PrismaMonitorSeverity.ALERT:
      return "alert";
    case PrismaMonitorSeverity.NO_DATA:
      return "no-data";
  }
};

/** statusToPrisma converts the monitorStatus api enum to the Prisma MonitorStatus enum. */
const statusToPrisma = (s: MonitorStatus): PrismaMonitorStatus => {
  switch (s) {
    case "active":
      return PrismaMonitorStatus.ACTIVE;
    case "paused":
      return PrismaMonitorStatus.PAUSED;
    case "error-bad-query":
      return PrismaMonitorStatus.ERROR_BAD_QUERY;
  }
};

/** statusFromPrisma converts the Prisma MonitorStatus enum to the monitorStatus api enum. */
const statusFromPrisma = (s: PrismaMonitorStatus): MonitorStatus => {
  switch (s) {
    case PrismaMonitorStatus.ACTIVE:
      return "active";
    case PrismaMonitorStatus.PAUSED:
      return "paused";
    case PrismaMonitorStatus.ERROR_BAD_QUERY:
      return "error-bad-query";
  }
};

/** thresholdOperatorToPrisma converts the monitorThresholdOperator api enum to the Prisma MonitorThresholdOperator enum. */
const thresholdOperatorToPrisma = (
  o: MonitorThresholdOperator,
): PrismaMonitorThresholdOperator => {
  switch (o) {
    case "gt":
      return PrismaMonitorThresholdOperator.GT;
    case "gte":
      return PrismaMonitorThresholdOperator.GTE;
    case "lt":
      return PrismaMonitorThresholdOperator.LT;
    case "lte":
      return PrismaMonitorThresholdOperator.LTE;
    case "eq":
      return PrismaMonitorThresholdOperator.EQ;
    case "neq":
      return PrismaMonitorThresholdOperator.NEQ;
  }
};

/** thresholdOperatorFromPrisma converts the Prisma MonitorThresholdOperator enum to the monitorThresholdOperator api enum. */
const thresholdOperatorFromPrisma = (
  o: PrismaMonitorThresholdOperator,
): MonitorThresholdOperator => {
  switch (o) {
    case PrismaMonitorThresholdOperator.GT:
      return "gt";
    case PrismaMonitorThresholdOperator.GTE:
      return "gte";
    case PrismaMonitorThresholdOperator.LT:
      return "lt";
    case PrismaMonitorThresholdOperator.LTE:
      return "lte";
    case PrismaMonitorThresholdOperator.EQ:
      return "eq";
    case PrismaMonitorThresholdOperator.NEQ:
      return "neq";
  }
};

/** windowToMs converts the kebab-case MonitorWindow api value to a bigint of milliseconds. */
const windowToMs = (w: MonitorWindow): bigint => {
  switch (w) {
    case "5m":
      return 5n * 60_000n;
    case "10m":
      return 10n * 60_000n;
    case "15m":
      return 15n * 60_000n;
    case "30m":
      return 30n * 60_000n;
    case "1h":
      return 60n * 60_000n;
    case "2h":
      return 2n * 60n * 60_000n;
    case "4h":
      return 4n * 60n * 60_000n;
    case "1d":
      return 24n * 60n * 60_000n;
    case "2d":
      return 2n * 24n * 60n * 60_000n;
    case "1w":
      return 7n * 24n * 60n * 60_000n;
  }
};

/** windowFromMs converts a bigint of milliseconds to MonitorWindow api value. */
const windowFromMs = (ms: bigint): MonitorWindow => {
  switch (ms) {
    case 5n * 60_000n:
      return "5m";
    case 10n * 60_000n:
      return "10m";
    case 15n * 60_000n:
      return "15m";
    case 30n * 60_000n:
      return "30m";
    case 60n * 60_000n:
      return "1h";
    case 2n * 60n * 60_000n:
      return "2h";
    case 4n * 60n * 60_000n:
      return "4h";
    case 24n * 60n * 60_000n:
      return "1d";
    case 2n * 24n * 60n * 60_000n:
      return "2d";
    case 7n * 24n * 60n * 60_000n:
      return "1w";
    default:
      throw new InvalidRequestError(
        `windowMs ${ms.toString()} does not correspond to a known MonitorWindow tier`,
      );
  }
};

/** monitorFromPrisma converts a Prisma monitor to a domain Monitor */
const monitorFromPrisma = (
  monitor: Awaited<ReturnType<typeof prisma.monitor.findFirstOrThrow>>,
): Monitor =>
  MonitorSchema.parse({
    ...monitor,
    view: viewFromPrisma(monitor.view),
    severity: severityFromPrisma(monitor.severity),
    status: statusFromPrisma(monitor.status),
    thresholdOperator: thresholdOperatorFromPrisma(monitor.thresholdOperator),
    window: windowFromMs(monitor.windowMs),
    alertThreshold: monitor.alertThreshold.toNumber(),
    warningThreshold: monitor.warningThreshold?.toNumber() ?? null,
  });

/** decimalToPrisma converts a nullable JS number to a Prisma.Decimal column type, preserving null. */
const decimalToPrisma = (n: number | null): Prisma.Decimal | null =>
  n == null ? null : new Prisma.Decimal(n);

/** errorFromPrisma converts a Prisma client error to a caller-facing Error */
const errorFromPrisma = (id: string, projectId: string, e: any): Error => {
  // Object not found in the database
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
    return new InvalidRequestError(
      `Monitor ${id} not found in project ${projectId}`,
    );
  }
  return e;
};
