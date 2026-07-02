import { beforeEach, describe, expect, it, vi } from "vitest";

const findProjects = vi.fn();
const findConversations = vi.fn();
const addBulk = vi.fn();

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    project: {
      findMany: findProjects,
    },
    inAppAgentConversation: {
      findMany: findConversations,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  DataRetentionProcessingQueue: {
    getInstance: () => ({ addBulk }),
  },
  getSandboxCleanupWhere: ({ now }: { now: Date }) => ({
    AND: [
      {},
      {
        OR: [{ sandboxExpiresAt: { lt: now } }],
      },
    ],
  }),
  QueueJobs: {
    DataRetentionProcessingJob: "DataRetentionProcessingJob",
  },
}));

describe("handleDataRetentionSchedule", () => {
  beforeEach(() => {
    findProjects.mockReset();
    findConversations.mockReset();
    addBulk.mockReset();
  });

  it("queues projects with expired sandbox sessions even without retention", async () => {
    findProjects.mockResolvedValue([]);
    findConversations.mockResolvedValue([{ projectId: "project-1" }]);

    const { handleDataRetentionSchedule } =
      await import("../ee/dataRetention/handleDataRetentionSchedule");

    await handleDataRetentionSchedule();

    expect(findConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { sandboxExpiresAt: { lt: expect.any(Date) } },
              ]),
            }),
          ]),
        }),
      }),
    );
    expect(addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        data: expect.objectContaining({
          payload: {
            projectId: "project-1",
            retention: null,
          },
        }),
      }),
    ]);
  });
});
