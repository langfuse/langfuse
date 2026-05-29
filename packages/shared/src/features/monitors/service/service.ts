/** service.ts contains the MonitorService. */
import { Prisma, prisma } from "../../../db";
import { LangfuseNotFoundError } from "../../../errors";

import { type Monitor } from "../types";

import {
  calculateCadence,
  calculateSchedulerBatchId,
  decimalToPrisma,
  errorFromPrisma,
  monitorFromPrisma,
  sortFiltersCanonically,
  toPrismaOrderBy,
  toPrismaWhere,
  updateSchedulerProperties,
  updateSeverityForStatus,
  initSeverity,
  viewToPrisma,
  windowToMs,
} from "./helpers";
import {
  type CreateMonitor,
  type DeleteMonitor,
  type GetMonitorById,
  type GetMonitorFilterOptions,
  type ListMonitors,
  MonitorNotFoundError,
  type SessionContext,
  type UpdateMonitor,
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
 * API adapters. Project membership and scope checks (RBAC) are enforced by
 * the caller (eg. tRPC middleware); this service trusts the supplied
 * `SessionContext.userId` and `input.projectId`.
 */
export class MonitorService {
  public static async create(
    session: SessionContext,
    input: CreateMonitor,
  ): Promise<Monitor> {
    const filters = sortFiltersCanonically(input.filters);
    const windowMs = windowToMs(input.window);
    const cadenceMs = calculateCadence(windowMs);
    const schedulerBatchId = calculateSchedulerBatchId({
      projectId: input.projectId,
      view: input.view,
      filters,
      windowMs,
    });

    const created = await prisma.monitor.create({
      data: {
        projectId: input.projectId,
        createdBy: session.userId,
        updatedBy: session.userId,
        view: viewToPrisma(input.view),
        filters,
        metric: input.metric,
        windowMs,
        cadenceMs,
        thresholdOperator: input.thresholdOperator,
        alertThreshold: new Prisma.Decimal(input.alertThreshold),
        warningThreshold: decimalToPrisma(input.warningThreshold),
        noData: input.noData,
        renotify: input.renotify,
        status: input.status,
        severity: initSeverity(input.status),
        schedulerBatchId,
        nextRunAt: null,
        name: input.name,
        tags: input.tags,
        triggerIds: input.triggerIds,
      },
    });
    return monitorFromPrisma(created);
  }

  public static async update(
    session: SessionContext,
    input: UpdateMonitor,
  ): Promise<Monitor> {
    const filters = sortFiltersCanonically(input.filters);
    const windowMs = windowToMs(input.window);
    const cadenceMs = calculateCadence(windowMs);
    const schedulerBatchId = calculateSchedulerBatchId({
      projectId: input.projectId,
      view: input.view,
      filters,
      windowMs,
    });

    try {
      const current = await prisma.monitor.findFirst({
        where: { id: input.id, projectId: input.projectId },
        select: { status: true, schedulerBatchId: true },
      });
      if (!current) {
        throw new LangfuseNotFoundError();
      }

      const updated = await prisma.monitor.update({
        where: { id: input.id, projectId: input.projectId },
        data: {
          updatedBy: session.userId,
          view: viewToPrisma(input.view),
          filters,
          metric: input.metric,
          windowMs,
          cadenceMs,
          thresholdOperator: input.thresholdOperator,
          alertThreshold: new Prisma.Decimal(input.alertThreshold),
          warningThreshold: decimalToPrisma(input.warningThreshold),
          noData: input.noData,
          renotify: input.renotify,
          status: input.status,
          ...updateSeverityForStatus(current.status, input.status),
          ...updateSchedulerProperties(
            current.schedulerBatchId,
            schedulerBatchId,
          ),
          name: input.name,
          tags: input.tags,
          triggerIds: input.triggerIds,
        },
      });
      return monitorFromPrisma(updated);
    } catch (e) {
      throw errorFromPrisma(input.id, input.projectId, e);
    }
  }

  public static async getById(
    _session: SessionContext,
    input: GetMonitorById,
  ): Promise<Monitor> {
    const monitor = await prisma.monitor.findFirst({
      where: { id: input.id, projectId: input.projectId },
    });
    if (!monitor) {
      throw new MonitorNotFoundError(input.id, input.projectId);
    }
    return monitorFromPrisma(monitor);
  }

  public static async list(
    _session: SessionContext,
    input: ListMonitors,
  ): Promise<{ monitors: Monitor[]; totalCount: number }> {
    const skip =
      input.page && input.limit ? (input.page - 1) * input.limit : undefined;
    const where = toPrismaWhere(input.projectId, input.filter);

    const [monitors, totalCount] = await Promise.all([
      prisma.monitor.findMany({
        where,
        orderBy: toPrismaOrderBy(input.orderBy),
        skip,
        take: input.limit,
      }),
      prisma.monitor.count({ where }),
    ]);

    return { monitors: monitors.map(monitorFromPrisma), totalCount };
  }

  public static async getFilterOptions(
    _session: SessionContext,
    input: GetMonitorFilterOptions,
  ): Promise<{ tags: { value: string }[] }> {
    const rows = await prisma.$queryRaw<{ value: string }[]>`
      SELECT tags.tag AS value
      FROM monitors, UNNEST(monitors.tags) AS tags(tag)
      WHERE monitors.project_id = ${input.projectId}
      GROUP BY tags.tag
      ORDER BY tags.tag ASC;
    `;
    return { tags: rows };
  }

  public static async delete(
    _session: SessionContext,
    input: DeleteMonitor,
  ): Promise<void> {
    try {
      await prisma.monitor.delete({
        where: { id: input.id, projectId: input.projectId },
      });
    } catch (e) {
      throw errorFromPrisma(input.id, input.projectId, e);
    }
  }
}
