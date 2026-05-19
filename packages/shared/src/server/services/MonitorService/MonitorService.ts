/** MonitorService.ts — direct Prisma CRUD over the Monitor row. */
import {
  MonitorSeverity,
  MonitorStatus,
  MonitorThresholdOperator,
  MonitorView,
} from "@prisma/client";
import { z } from "zod";

import { Prisma, prisma } from "../../../db";
import { InvalidRequestError } from "../../../errors";
import { type OrderByState } from "../../../interfaces/orderBy";
import { type viewsV2 } from "../../../features/query/types";
import {
  calculateMonitorWindowCadenceMillis,
  type CreateMonitorInput,
  monitorSeverity,
  MonitorSchema,
  monitorStatus,
  monitorThresholdOperator,
  type UpdateMonitorInput,
} from "./types";
import {
  calculateLastRunAt,
  calculateSchedulerBatchId,
  sortFiltersCanonically,
} from "./internal";

type Monitor = z.infer<typeof MonitorSchema>;

// The Monitor domain speaks kebab-case (matching `viewsV2` and the local
// `monitorSeverity` / `monitorStatus` / `monitorThresholdOperator` zod enums);
// Prisma stores SCREAMING_SNAKE via its generated enums. The helpers below are
// the only places the codebase translates between the two formats.
const viewToPrisma = (view: z.infer<typeof viewsV2>): MonitorView => {
  switch (view) {
    case "observations":
      return MonitorView.OBSERVATIONS;
    case "scores-numeric":
      return MonitorView.SCORES_NUMERIC;
    case "scores-categorical":
      return MonitorView.SCORES_CATEGORICAL;
  }
};

const viewFromPrisma = (view: MonitorView): z.infer<typeof viewsV2> => {
  switch (view) {
    case MonitorView.OBSERVATIONS:
      return "observations";
    case MonitorView.SCORES_NUMERIC:
      return "scores-numeric";
    case MonitorView.SCORES_CATEGORICAL:
      return "scores-categorical";
  }
};

// `severityToPrisma` is intentionally omitted — severity is worker-owned and
// the service never writes it. The future worker `applyResults` method will
// add it back when that path lands.

const severityFromPrisma = (
  s: MonitorSeverity,
): z.infer<typeof monitorSeverity> => {
  switch (s) {
    case MonitorSeverity.UNKNOWN:
      return "unknown";
    case MonitorSeverity.OK:
      return "ok";
    case MonitorSeverity.WARNING:
      return "warning";
    case MonitorSeverity.ALERT:
      return "alert";
    case MonitorSeverity.NO_DATA:
      return "no-data";
  }
};

const statusToPrisma = (s: z.infer<typeof monitorStatus>): MonitorStatus => {
  switch (s) {
    case "active":
      return MonitorStatus.ACTIVE;
    case "paused":
      return MonitorStatus.PAUSED;
    case "error-bad-query":
      return MonitorStatus.ERROR_BAD_QUERY;
  }
};

const statusFromPrisma = (s: MonitorStatus): z.infer<typeof monitorStatus> => {
  switch (s) {
    case MonitorStatus.ACTIVE:
      return "active";
    case MonitorStatus.PAUSED:
      return "paused";
    case MonitorStatus.ERROR_BAD_QUERY:
      return "error-bad-query";
  }
};

const thresholdOperatorToPrisma = (
  o: z.infer<typeof monitorThresholdOperator>,
): MonitorThresholdOperator => {
  switch (o) {
    case "gt":
      return MonitorThresholdOperator.GT;
    case "gte":
      return MonitorThresholdOperator.GTE;
    case "lt":
      return MonitorThresholdOperator.LT;
    case "lte":
      return MonitorThresholdOperator.LTE;
    case "eq":
      return MonitorThresholdOperator.EQ;
    case "neq":
      return MonitorThresholdOperator.NEQ;
  }
};

const thresholdOperatorFromPrisma = (
  o: MonitorThresholdOperator,
): z.infer<typeof monitorThresholdOperator> => {
  switch (o) {
    case MonitorThresholdOperator.GT:
      return "gt";
    case MonitorThresholdOperator.GTE:
      return "gte";
    case MonitorThresholdOperator.LT:
      return "lt";
    case MonitorThresholdOperator.LTE:
      return "lte";
    case MonitorThresholdOperator.EQ:
      return "eq";
    case MonitorThresholdOperator.NEQ:
      return "neq";
  }
};

// Prisma row → Monitor domain object. Field names match 1:1 except `windowMs`
// (renamed back to `window`), the kebab-case `view`, and the two Decimal
// threshold columns.
type PrismaMonitorRow = Awaited<
  ReturnType<typeof prisma.monitor.findFirstOrThrow>
>;
const toMonitor = (row: PrismaMonitorRow): Monitor =>
  MonitorSchema.parse({
    ...row,
    view: viewFromPrisma(row.view),
    severity: severityFromPrisma(row.severity),
    status: statusFromPrisma(row.status),
    thresholdOperator: thresholdOperatorFromPrisma(row.thresholdOperator),
    window: row.windowMs,
    alertThreshold: row.alertThreshold.toNumber(),
    warningThreshold: row.warningThreshold?.toNumber() ?? null,
  });

const toDecimal = (n: number | null): Prisma.Decimal | null =>
  n == null ? null : new Prisma.Decimal(n);

/**
 * MonitorService — direct Prisma CRUD. On every write, normalizes filters and
 * recomputes `schedulerBatchId`, `cadenceMs`, and `nextRunAt` so the scheduler
 * and queue processor downstream see a canonical row.
 */
export class MonitorService {
  public static async create(input: CreateMonitorInput): Promise<Monitor> {
    const filters = sortFiltersCanonically(input.filters);
    const cadenceMs = calculateMonitorWindowCadenceMillis(input.window);
    const schedulerBatchId = calculateSchedulerBatchId({
      projectId: input.projectId,
      view: input.view,
      filters,
      windowMs: input.window,
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
        windowMs: input.window,
        cadenceMs,
        thresholdOperator: thresholdOperatorToPrisma(input.thresholdOperator),
        alertThreshold: new Prisma.Decimal(input.alertThreshold),
        warningThreshold: toDecimal(input.warningThreshold),
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
    return toMonitor(created);
  }

  public static async update(input: UpdateMonitorInput): Promise<Monitor> {
    const filters = sortFiltersCanonically(input.filters);
    const cadenceMs = calculateMonitorWindowCadenceMillis(input.window);
    const schedulerBatchId = calculateSchedulerBatchId({
      projectId: input.projectId,
      view: input.view,
      filters,
      windowMs: input.window,
    });
    const nextRunAt = calculateLastRunAt(
      new Date(),
      cadenceMs,
      schedulerBatchId,
    );

    // Worker-owned lifecycle columns (severity, severityChangedAt, alertedAt,
    // lastPublishedRunAt, lastCompletedRunAt) are intentionally not touched.
    try {
      const updated = await prisma.monitor.update({
        where: { id: input.id, projectId: input.projectId },
        data: {
          updatedBy: input.updatedBy,
          view: viewToPrisma(input.view),
          filters,
          metric: input.metric,
          windowMs: input.window,
          cadenceMs,
          thresholdOperator: thresholdOperatorToPrisma(input.thresholdOperator),
          alertThreshold: new Prisma.Decimal(input.alertThreshold),
          warningThreshold: toDecimal(input.warningThreshold),
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
      return toMonitor(updated);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2025"
      ) {
        throw new InvalidRequestError(
          `Monitor ${input.id} not found in project ${input.projectId}`,
        );
      }
      throw e;
    }
  }

  public static async getById(
    monitorId: string,
    projectId: string,
  ): Promise<Monitor | null> {
    const row = await prisma.monitor.findFirst({
      where: { id: monitorId, projectId },
    });
    return row ? toMonitor(row) : null;
  }

  public static async list(params: {
    projectId: string;
    limit?: number;
    page?: number;
    orderBy?: OrderByState;
  }): Promise<{ monitors: Monitor[]; totalCount: number }> {
    const skip =
      params.page && params.limit
        ? (params.page - 1) * params.limit
        : undefined;

    const [rows, totalCount] = await Promise.all([
      prisma.monitor.findMany({
        where: { projectId: params.projectId },
        orderBy: params.orderBy
          ? [{ [params.orderBy.column]: params.orderBy.order.toLowerCase() }]
          : [{ updatedAt: "desc" }],
        skip,
        take: params.limit,
      }),
      prisma.monitor.count({ where: { projectId: params.projectId } }),
    ]);

    return { monitors: rows.map(toMonitor), totalCount };
  }

  public static async delete(
    monitorId: string,
    projectId: string,
  ): Promise<void> {
    await prisma.monitor.delete({
      where: { id: monitorId, projectId },
    });
  }
}
