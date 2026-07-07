import { beforeEach, describe, expect, it, vi } from "vitest";

const findProjects = vi.fn();
const addBulk = vi.fn();

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    project: {
      findMany: findProjects,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  DataRetentionProcessingQueue: {
    getInstance: () => ({ addBulk }),
  },
  QueueJobs: {
    DataRetentionProcessingJob: "DataRetentionProcessingJob",
  },
}));

describe("handleDataRetentionSchedule", () => {
  beforeEach(() => {
    findProjects.mockReset();
    addBulk.mockReset();
  });

  it("queues projects with retention", async () => {
    findProjects.mockResolvedValue([
      { id: "project-1", retentionDays: 7 },
      { id: "project-2", retentionDays: 30 },
    ]);

    const { handleDataRetentionSchedule } =
      await import("../ee/dataRetention/handleDataRetentionSchedule");

    await handleDataRetentionSchedule();

    expect(findProjects).toHaveBeenCalledWith({
      select: {
        id: true,
        retentionDays: true,
      },
      where: {
        retentionDays: {
          gt: 0,
        },
      },
    });
    expect(addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        data: expect.objectContaining({
          payload: {
            projectId: "project-1",
            retention: 7,
          },
        }),
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          payload: {
            projectId: "project-2",
            retention: 30,
          },
        }),
      }),
    ]);
  });
});
