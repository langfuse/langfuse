import { v4 as uuidv4 } from "uuid";
import {
  createOrgProjectAndApiKey,
  MonitorService,
  type SessionContext,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { LangfuseNotFoundError } from "@langfuse/shared";

const baseMonitorInput = (projectId: string) => ({
  projectId,
  view: "observations" as const,
  filters: [],
  metric: { measure: "count", aggregation: "count" as const },
  window: "5m" as const,
  thresholdOperator: "gt" as const,
  alertThreshold: 100,
  warningThreshold: null,
  noData: { mode: "SILENT" as const },
  renotify: { mode: "OFF" as const },
  status: "active" as const,
  name: "High error rate",
  tags: [],
});

describe("MonitorService (integration)", () => {
  let projectId: string;
  let creator: SessionContext;
  let editor: SessionContext;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
    const creatorUser = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `monitor-creator-${uuidv4().substring(0, 8)}@test.com`,
        name: "Creator",
      },
    });
    const editorUser = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `monitor-editor-${uuidv4().substring(0, 8)}@test.com`,
        name: "Editor",
      },
    });
    creator = { userId: creatorUser.id };
    editor = { userId: editorUser.id };
  });

  afterEach(async () => {
    await prisma.monitor.deleteMany({ where: { projectId } });
  });

  describe("create", () => {
    it("creates a monitor and persists derived fields", async () => {
      const created = await MonitorService.create(
        creator,
        baseMonitorInput(projectId),
      );

      const row = await prisma.monitor.findUnique({
        where: { id: created.id },
      });
      expect(row).not.toBeNull();
      expect(row!.windowMs).toBe(5n * 60_000n);
      // "5m" is a sub-day window → 1-minute cadence.
      expect(row!.cadenceMs).toBe(60_000n);
      expect(row!.schedulerBatchId).toBeGreaterThan(0n);
      expect(row!.nextRunAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(row!.severity).toBe("UNKNOWN");
      expect(row!.createdBy).toBe(creator.userId);
      expect(row!.updatedBy).toBe(creator.userId);
    });

    it("canonicalizes filter order so permutations share the same schedulerBatchId", async () => {
      const filterA = {
        column: "environment" as const,
        operator: "=" as const,
        value: "production",
        type: "string" as const,
      };
      const filterB = {
        column: "name" as const,
        operator: "=" as const,
        value: "faq-bot",
        type: "string" as const,
      };

      const first = await MonitorService.create(creator, {
        ...baseMonitorInput(projectId),
        filters: [filterA, filterB],
      });
      const second = await MonitorService.create(creator, {
        ...baseMonitorInput(projectId),
        filters: [filterB, filterA],
      });

      const rows = await prisma.monitor.findMany({
        where: { id: { in: [first.id, second.id] } },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].schedulerBatchId).toBe(rows[1].schedulerBatchId);
    });

    it("yields a different schedulerBatchId for different projects", async () => {
      const otherOrg = await createOrgProjectAndApiKey();
      const otherProject = otherOrg.projectId;

      const here = await MonitorService.create(
        creator,
        baseMonitorInput(projectId),
      );
      const there = await MonitorService.create(
        creator,
        baseMonitorInput(otherProject),
      );

      const rows = await prisma.monitor.findMany({
        where: { id: { in: [here.id, there.id] } },
      });
      const idHere = rows.find((r) => r.id === here.id)!.schedulerBatchId;
      const idThere = rows.find((r) => r.id === there.id)!.schedulerBatchId;
      expect(idHere).not.toBe(idThere);

      await prisma.monitor.deleteMany({ where: { projectId: otherProject } });
    });
  });

  describe("update", () => {
    it("updates user-editable fields and preserves worker-owned lifecycle state", async () => {
      const created = await MonitorService.create(
        creator,
        baseMonitorInput(projectId),
      );

      // Simulate the worker writing lifecycle state between create and update.
      await prisma.monitor.update({
        where: { id: created.id },
        data: {
          severity: "ALERT",
          severityChangedAt: new Date(),
          alertedAt: new Date(),
          lastCompletedRunAt: new Date(),
        },
      });

      const updated = await MonitorService.update(editor, {
        ...baseMonitorInput(projectId),
        id: created.id,
        name: "Renamed",
      });

      expect(updated.name).toBe("Renamed");
      expect(updated.severity).toBe("alert");
      expect(updated.severityChangedAt).not.toBeNull();
      expect(updated.alertedAt).not.toBeNull();
      expect(updated.lastCompletedRunAt).not.toBeNull();

      const row = await prisma.monitor.findUnique({
        where: { id: created.id },
      });
      expect(row!.createdBy).toBe(creator.userId);
      expect(row!.updatedBy).toBe(editor.userId);
    });

    it("throws LangfuseNotFoundError when the monitor does not exist", async () => {
      await expect(
        MonitorService.update(editor, {
          ...baseMonitorInput(projectId),
          id: "mon_missing",
        }),
      ).rejects.toBeInstanceOf(LangfuseNotFoundError);
    });
  });

  describe("getById / list / delete", () => {
    it("returns the monitor by id within the project", async () => {
      const created = await MonitorService.create(
        creator,
        baseMonitorInput(projectId),
      );
      const fetched = await MonitorService.getById(creator, {
        projectId,
        id: created.id,
      });
      expect(fetched?.id).toBe(created.id);
    });

    it("returns null when fetching from a different project", async () => {
      const created = await MonitorService.create(
        creator,
        baseMonitorInput(projectId),
      );
      const fetched = await MonitorService.getById(creator, {
        projectId: "other_project",
        id: created.id,
      });
      expect(fetched).toBeNull();
    });

    it("paginates list results", async () => {
      for (let i = 0; i < 3; i++) {
        await MonitorService.create(creator, {
          ...baseMonitorInput(projectId),
          name: `M${i}`,
        });
      }
      const page = await MonitorService.list(creator, {
        projectId,
        orderBy: null,
        limit: 2,
        page: 1,
      });
      expect(page.totalCount).toBe(3);
      expect(page.monitors).toHaveLength(2);
    });

    it("deletes a monitor", async () => {
      const created = await MonitorService.create(
        creator,
        baseMonitorInput(projectId),
      );
      await MonitorService.delete(creator, { projectId, id: created.id });
      const fetched = await MonitorService.getById(creator, {
        projectId,
        id: created.id,
      });
      expect(fetched).toBeNull();
    });

    it.each(["name", "status", "severity", "createdAt", "updatedAt"] as const)(
      "lists by %s (non-nullable column) without a PrismaClientValidationError",
      async (column) => {
        // Verifies whether Prisma accepts `{ sort, nulls: "last" }` on
        // non-nullable columns. If it doesn't, this throws
        // PrismaClientValidationError at runtime and we need to gate `nulls`
        // on the nullable subset instead.
        await MonitorService.create(creator, baseMonitorInput(projectId));
        const result = await MonitorService.list(creator, {
          projectId,
          orderBy: { column, order: "ASC" },
          page: 1,
          limit: 10,
        });
        expect(result.monitors.length).toBeGreaterThan(0);
      },
    );

    it.each(["alertedAt", "severityChangedAt"] as const)(
      "sorts %s with NULLS LAST regardless of direction",
      async (column) => {
        const dbColumn =
          column === "alertedAt" ? "alertedAt" : "severityChangedAt";

        // Three monitors: one never-touched (NULL), one older, one newer.
        const neverTouched = await MonitorService.create(creator, {
          ...baseMonitorInput(projectId),
          name: "never",
        });
        const older = await MonitorService.create(creator, {
          ...baseMonitorInput(projectId),
          name: "older",
        });
        const newer = await MonitorService.create(creator, {
          ...baseMonitorInput(projectId),
          name: "newer",
        });

        await prisma.monitor.update({
          where: { id: older.id },
          data: { [dbColumn]: new Date("2026-01-01T00:00:00.000Z") },
        });
        await prisma.monitor.update({
          where: { id: newer.id },
          data: { [dbColumn]: new Date("2026-06-01T00:00:00.000Z") },
        });

        const desc = await MonitorService.list(creator, {
          projectId,
          orderBy: { column, order: "DESC" },
          page: 1,
          limit: 10,
        });
        expect(desc.monitors.map((m) => m.id)).toEqual([
          newer.id,
          older.id,
          neverTouched.id,
        ]);

        const asc = await MonitorService.list(creator, {
          projectId,
          orderBy: { column, order: "ASC" },
          page: 1,
          limit: 10,
        });
        expect(asc.monitors.map((m) => m.id)).toEqual([
          older.id,
          newer.id,
          neverTouched.id,
        ]);
      },
    );
  });
});
