import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import {
  AdminIssueDetectionQueue,
  executeAdminIssueRules,
  QueueJobs,
  QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  adminIssueDetectionProcessor,
  adminIssueScheduleProcessor,
} from "../adminIssueQueue";

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { project: { findMany: vi.fn() } },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    AdminIssueDetectionJobSchema: actual.AdminIssueDetectionJobSchema,
    QueueJobs: actual.QueueJobs,
    QueueName: actual.QueueName,
    AdminIssueDetectionQueue: { getInstance: vi.fn() },
    executeAdminIssueRules: vi.fn(),
    instrumentAsync: vi.fn((_options, callback) => callback()),
  };
});

describe("admin issue jobs", () => {
  const addBulk = vi.fn();
  const scheduleJob = { name: QueueJobs.AdminIssueScheduleJob } as Job;
  const detectionJob = {
    name: QueueJobs.AdminIssueDetectionJob,
    data: { payload: { projectId: "project-a" } },
  } as Job<TQueueJobTypes[QueueName.AdminIssueDetectionQueue]>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(AdminIssueDetectionQueue.getInstance).mockReturnValue({
      addBulk,
    } as unknown as NonNullable<
      ReturnType<typeof AdminIssueDetectionQueue.getInstance>
    >);
  });

  it("dispatches one job per active project across bounded pages", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({
      id: `project-${String(i).padStart(4, "0")}`,
    }));
    vi.mocked(prisma.project.findMany)
      .mockResolvedValueOnce(firstPage as never)
      .mockResolvedValueOnce([{ id: "project-1000" }] as never);

    await adminIssueScheduleProcessor(scheduleJob);

    expect(prisma.project.findMany).toHaveBeenNthCalledWith(1, {
      select: { id: true },
      where: { deletedAt: null },
      orderBy: { id: "asc" },
      take: 1000,
    });
    expect(prisma.project.findMany).toHaveBeenNthCalledWith(2, {
      select: { id: true },
      where: { deletedAt: null, id: { gt: "project-0999" } },
      orderBy: { id: "asc" },
      take: 1000,
    });
    const jobs = addBulk.mock.calls.flatMap(([batch]) => batch);
    expect(jobs.map((job) => job.data.payload.projectId)).toEqual([
      ...firstPage.map(({ id }) => id),
      "project-1000",
    ]);
    expect(
      jobs.every((job) => job.name === QueueJobs.AdminIssueDetectionJob),
    ).toBe(true);
  });

  it("runs the rules for the project in the validated payload", async () => {
    await adminIssueDetectionProcessor(detectionJob);
    expect(executeAdminIssueRules).toHaveBeenCalledExactlyOnceWith("project-a");
  });
});
