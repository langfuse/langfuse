import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../../../db", async () => {
  const { Prisma } = await import("@prisma/client");
  return {
    Prisma,
    prisma: {
      monitor: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

import { prisma } from "../../../db";
import { calculateSchedulerBatchId } from "./helpers";
import { MonitorService } from "./service";
import { type SessionContext, type UpdateMonitor } from "./types";

const unchangedBatchId = calculateSchedulerBatchId({
  projectId: "proj_01",
  view: "observations",
  filters: [],
  windowMs: 300000n,
});

const session: SessionContext = { userId: "user_01" };

const input: UpdateMonitor = {
  id: "mon_01",
  projectId: "proj_01",
  view: "observations",
  filters: [],
  metric: { measure: "count", aggregation: "count" },
  window: "5m",
  thresholdOperator: "GT",
  alertThreshold: 100,
  warningThreshold: null,
  noData: { mode: "SILENT" },
  renotify: { mode: "OFF" },
  status: "ACTIVE",
  name: "High error rate",
  tags: [],
  triggerIds: [],
};

const prismaRow = {
  id: "mon_01",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "user_01",
  updatedBy: "user_01",
  projectId: "proj_01",
  view: "OBSERVATIONS",
  filters: [],
  metric: { measure: "count", aggregation: "count" },
  windowMs: 300000n,
  cadenceMs: 60000n,
  thresholdOperator: "GT",
  alertThreshold: { toNumber: () => 100 },
  warningThreshold: null,
  severity: "UNKNOWN",
  severityChangedAt: null,
  noData: { mode: "SILENT" },
  renotify: { mode: "OFF" },
  status: "ACTIVE",
  schedulerBatchId: 42n,
  nextRunAt: null,
  lastPublishedAt: null,
  lastClaimedAt: null,
  lastCompletedAt: null,
  name: "High error rate",
  tags: [],
  triggerIds: [],
  alertedAt: null,
};

describe("MonitorService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.monitor.findFirst as any).mockResolvedValue(prismaRow);
    (prisma.monitor.update as any).mockResolvedValue(prismaRow);
  });

  it("pre-update read is scoped by projectId", async () => {
    await MonitorService.update(session, input);

    expect(prisma.monitor.findFirst).toHaveBeenCalledWith({
      where: { id: input.id, projectId: input.projectId },
    });
  });

  it("resume PAUSED->ACTIVE resets next_run_at and lifecycle stamps", async () => {
    (prisma.monitor.findFirst as any).mockResolvedValue({
      ...prismaRow,
      status: "PAUSED",
      schedulerBatchId: unchangedBatchId,
      nextRunAt: new Date("2026-05-01T00:00:00.000Z"),
      lastPublishedAt: new Date("2026-05-01T00:00:00.000Z"),
      lastCompletedAt: new Date("2026-05-01T00:00:00.000Z"),
      lastClaimedAt: new Date("2026-05-01T00:00:00.000Z"),
    });

    await MonitorService.update(session, { ...input, status: "ACTIVE" });

    const data = (prisma.monitor.update as any).mock.calls[0][0].data;
    expect(data.nextRunAt).toBeNull();
    expect(data.lastPublishedAt).toBeNull();
    expect(data.lastCompletedAt).toBeNull();
    expect(data.lastClaimedAt).toBeNull();
  });
});
