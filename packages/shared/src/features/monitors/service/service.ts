/** service.ts contains the MonitorServicee */
import { Prisma, prisma } from "../../../db";

import { type Monitor } from "../types";

import {
  calculateCadence,
  calculateLastRunAt,
  calculateSchedulerBatchId,
  decimalToPrisma,
  errorFromPrisma,
  monitorFromPrisma,
  sortFiltersCanonically,
  statusToPrisma,
  thresholdOperatorToPrisma,
  viewToPrisma,
  windowToMs,
} from "./helpers";
import {
  type CreateMonitorInput,
  type MonitorListInput,
  type UpdateMonitorInput,
} from "./types";

/**
 * MonitorService manages all of the Monitors that produce MonitorAlerts on
 * the system.
 *
 * It normalizes data, calculates derived properties, and persists data to
 * the Prisma repository.
 *
 * Validation is handled directly by the zod schema found in `service/types`.
 * Services assume the inputs have been parsed and validated by tRPC or other
 * API adapters.
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
