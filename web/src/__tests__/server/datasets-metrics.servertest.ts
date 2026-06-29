import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { randomUUID } from "crypto";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const session: Session = {
  expires: "1",
  user: {
    id: "user-1",
    canCreateOrganizations: true,
    name: "Demo User",
    organizations: [
      {
        id: "seed-org-id",
        name: "Test Organization",
        role: "OWNER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        projects: [
          {
            id: projectId,
            role: "ADMIN",
            retentionDays: 30,
            deletedAt: null,
            name: "Test Project",
          },
        ],
      },
    ],
    featureFlags: {
      excludeClickhouseRead: false,
      templateFlag: true,
    },
    admin: true,
  },
  environment: {} as any,
};

const ctx = createInnerTRPCContext({ session });
const caller = appRouter.createCaller({ ...ctx, prisma });

describe("datasets.allDatasetsMetrics", () => {
  it("should return empty metrics for empty datasetIds", async () => {
    const result = await caller.datasets.allDatasetsMetrics({
      projectId,
      datasetIds: [],
    });

    expect(result).toEqual({ metrics: [] });
  });

  it("should return metrics for datasets with runs", async () => {
    const datasetId = randomUUID();
    const runId = randomUUID();

    await prisma.dataset.create({
      data: { id: datasetId, projectId, name: `test-metrics-${datasetId}` },
    });

    await prisma.datasetRuns.create({
      data: {
        id: runId,
        projectId,
        datasetId,
        name: `run-${runId}`,
      },
    });

    const result = await caller.datasets.allDatasetsMetrics({
      projectId,
      datasetIds: [datasetId],
    });

    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0].id).toBe(datasetId);
    expect(Number(result.metrics[0].countDatasetRuns)).toBe(1);
    expect(result.metrics[0].lastRunAt).toBeInstanceOf(Date);
  });

  it("should return metrics for datasets without runs", async () => {
    const datasetId = randomUUID();

    await prisma.dataset.create({
      data: { id: datasetId, projectId, name: `test-no-runs-${datasetId}` },
    });

    const result = await caller.datasets.allDatasetsMetrics({
      projectId,
      datasetIds: [datasetId],
    });

    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0].id).toBe(datasetId);
    expect(Number(result.metrics[0].countDatasetRuns)).toBe(0);
    expect(result.metrics[0].lastRunAt).toBeNull();
  });

  it("should return metrics for multiple datasets", async () => {
    const datasetId1 = randomUUID();
    const datasetId2 = randomUUID();

    await prisma.dataset.createMany({
      data: [
        { id: datasetId1, projectId, name: `test-multi-1-${datasetId1}` },
        { id: datasetId2, projectId, name: `test-multi-2-${datasetId2}` },
      ],
    });

    await prisma.datasetRuns.createMany({
      data: [
        {
          id: randomUUID(),
          projectId,
          datasetId: datasetId1,
          name: `run-1`,
        },
        {
          id: randomUUID(),
          projectId,
          datasetId: datasetId1,
          name: `run-2`,
        },
      ],
    });

    const result = await caller.datasets.allDatasetsMetrics({
      projectId,
      datasetIds: [datasetId1, datasetId2],
    });

    expect(result.metrics).toHaveLength(2);

    const metric1 = result.metrics.find((m) => m.id === datasetId1);
    const metric2 = result.metrics.find((m) => m.id === datasetId2);

    expect(Number(metric1?.countDatasetRuns)).toBe(2);
    expect(metric1?.lastRunAt).toBeInstanceOf(Date);

    expect(Number(metric2?.countDatasetRuns)).toBe(0);
    expect(metric2?.lastRunAt).toBeNull();
  });
});
