import { v4 as uuidv4 } from "uuid";
import {
  calculateMonitorWindowCadenceMillis,
  createOrgProjectAndApiKey,
  MonitorService,
  MonitorWindow,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { InvalidRequestError } from "@langfuse/shared";

const baseCreateInput = (
  projectId: string,
  createdBy: string | null = null,
) => ({
  projectId,
  createdBy,
  view: "observations" as const,
  filters: [],
  metric: { measure: "count", aggregation: "count" as const },
  window: MonitorWindow.FIVE_MIN,
  thresholdOperator: "gt" as const,
  alertThreshold: 100,
  warningThreshold: null,
  noData: { mode: "SILENT" as const },
  renotify: { mode: "OFF" as const },
  name: "High error rate",
  message: "",
  tags: [],
});

const baseUpdateInput = (
  projectId: string,
  updatedBy: string | null = null,
) => ({
  projectId,
  updatedBy,
  view: "observations" as const,
  filters: [],
  metric: { measure: "count", aggregation: "count" as const },
  window: MonitorWindow.FIVE_MIN,
  thresholdOperator: "gt" as const,
  alertThreshold: 100,
  warningThreshold: null,
  noData: { mode: "SILENT" as const },
  renotify: { mode: "OFF" as const },
  name: "High error rate",
  message: "",
  tags: [],
});

describe("MonitorService (integration)", () => {
  let projectId: string;
  let creatorUserId: string;
  let editorUserId: string;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
    const creator = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `monitor-creator-${uuidv4().substring(0, 8)}@test.com`,
        name: "Creator",
      },
    });
    const editor = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `monitor-editor-${uuidv4().substring(0, 8)}@test.com`,
        name: "Editor",
      },
    });
    creatorUserId = creator.id;
    editorUserId = editor.id;
  });

  afterEach(async () => {
    await prisma.monitor.deleteMany({ where: { projectId } });
  });

  describe("create", () => {
    it("creates a monitor and persists derived fields", async () => {
      const created = await MonitorService.create(baseCreateInput(projectId));

      const row = await prisma.monitor.findUnique({
        where: { id: created.id },
      });
      expect(row).not.toBeNull();
      expect(row!.windowMs).toBe(MonitorWindow.FIVE_MIN);
      expect(row!.cadenceMs).toBe(
        calculateMonitorWindowCadenceMillis(MonitorWindow.FIVE_MIN),
      );
      expect(row!.schedulerBatchId).toBeGreaterThan(0n);
      expect(row!.nextRunAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(row!.severity).toBe("UNKNOWN");
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

      const first = await MonitorService.create({
        ...baseCreateInput(projectId),
        filters: [filterA, filterB],
      });
      const second = await MonitorService.create({
        ...baseCreateInput(projectId),
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

      const here = await MonitorService.create(baseCreateInput(projectId));
      const there = await MonitorService.create(baseCreateInput(otherProject));

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
        baseCreateInput(projectId, creatorUserId),
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

      const updated = await MonitorService.update({
        ...baseUpdateInput(projectId, editorUserId),
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
      expect(row!.createdBy).toBe(creatorUserId);
      expect(row!.updatedBy).toBe(editorUserId);
    });

    it("throws InvalidRequestError when the monitor does not exist", async () => {
      await expect(
        MonitorService.update({
          ...baseUpdateInput(projectId),
          id: "mon_missing",
        }),
      ).rejects.toBeInstanceOf(InvalidRequestError);
    });
  });

  describe("getById / list / delete", () => {
    it("returns the monitor by id within the project", async () => {
      const created = await MonitorService.create(baseCreateInput(projectId));
      const fetched = await MonitorService.getById(created.id, projectId);
      expect(fetched?.id).toBe(created.id);
    });

    it("returns null when fetching from a different project", async () => {
      const created = await MonitorService.create(baseCreateInput(projectId));
      const fetched = await MonitorService.getById(created.id, "other_project");
      expect(fetched).toBeNull();
    });

    it("paginates list results", async () => {
      for (let i = 0; i < 3; i++) {
        await MonitorService.create({
          ...baseCreateInput(projectId),
          name: `M${i}`,
        });
      }
      const page = await MonitorService.list({
        projectId,
        limit: 2,
        page: 1,
      });
      expect(page.totalCount).toBe(3);
      expect(page.monitors).toHaveLength(2);
    });

    it("deletes a monitor", async () => {
      const created = await MonitorService.create(baseCreateInput(projectId));
      await MonitorService.delete(created.id, projectId);
      const fetched = await MonitorService.getById(created.id, projectId);
      expect(fetched).toBeNull();
    });
  });
});
