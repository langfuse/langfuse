import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRegressionRunJobClickhouse } from "../features/regressionRuns/regressionRunServiceClickhouse";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import * as experimentService from "../features/experiments/experimentServiceClickhouse";

const createSelectChain = <T>(resolvedValue: T) => {
  const executeTakeFirst = vi.fn().mockResolvedValue(resolvedValue);
  const where: any = vi.fn(() => ({ where, executeTakeFirst }));
  return {
    selectAll: vi.fn().mockReturnValue({ where, executeTakeFirst }),
    select: vi.fn().mockReturnValue({ where, executeTakeFirst }),
  } as any;
};

const createUpdateChain = () => {
  const execute = vi.fn().mockResolvedValue(undefined);
  const whereSecond: any = vi.fn(() => ({ execute }));
  const whereFirst: any = vi.fn(() => ({ where: whereSecond, execute }));
  return {
    set: vi.fn().mockReturnValue({ where: whereFirst }),
    execute,
    whereFirst,
    whereSecond,
  } as any;
};

describe("createRegressionRunJobClickhouse", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("delegates to experiment processing and updates regression run status", async () => {
    const selectFromMock = vi.spyOn(kyselyPrisma.$kysely, "selectFrom");
    selectFromMock
      .mockImplementationOnce(() =>
        createSelectChain({
          id: "run-1",
          project_id: "project-1",
        }),
      )
      .mockImplementationOnce(() => createSelectChain({ count: "5" }));

    const updateCalls: Array<{ table: string; set: any }> = [];
    vi.spyOn(kyselyPrisma.$kysely, "updateTable").mockImplementation(
      (table) => {
        const chain = createUpdateChain();
        updateCalls.push({ table, set: chain.set });
        return { set: chain.set } as any;
      },
    );

    const experimentSpy = vi
      .spyOn(experimentService, "createExperimentJobClickhouse")
      .mockResolvedValue({ success: true });

    const result = await createRegressionRunJobClickhouse({
      event: {
        projectId: "project-1",
        datasetId: "dataset-1",
        runId: "run-1",
        experimentId: "experiment-1",
        evaluators: [],
        description: "desc",
      },
    });

    expect(experimentSpy).toHaveBeenCalledWith({
      event: {
        projectId: "project-1",
        datasetId: "dataset-1",
        runId: "run-1",
        description: "desc",
      },
    });

    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0]?.table).toBe("regression_runs");
    expect(updateCalls[0]?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "running" }),
    );
    expect(updateCalls[1]?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );

    expect(result).toEqual({ success: true, processedCount: 5 });
  });

  it("marks regression run as failed when experiment processing throws", async () => {
    const selectFromMock = vi.spyOn(kyselyPrisma.$kysely, "selectFrom");
    selectFromMock
      .mockImplementationOnce(() =>
        createSelectChain({
          id: "run-2",
          project_id: "project-2",
        }),
      )
      .mockImplementationOnce(() => createSelectChain({ count: "0" }));

    const updateChains: Array<{ table: string; set: any }> = [];
    vi.spyOn(kyselyPrisma.$kysely, "updateTable").mockImplementation(
      (table) => {
        const chain = createUpdateChain();
        updateChains.push({ table, set: chain.set });
        return { set: chain.set } as any;
      },
    );

    vi.spyOn(
      experimentService,
      "createExperimentJobClickhouse",
    ).mockRejectedValue(new Error("failed"));

    await expect(
      createRegressionRunJobClickhouse({
        event: {
          projectId: "project-2",
          datasetId: "dataset-2",
          runId: "run-2",
          experimentId: "experiment-2",
          evaluators: [],
          description: undefined,
        },
      }),
    ).rejects.toThrow("failed");

    // First update should set status running, subsequent one should set failed
    expect(updateChains.at(0)?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "running" }),
    );
    expect(updateChains.at(-1)?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });
});
