import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { EvalTargetObject } from "@langfuse/shared";

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    jobConfiguration: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    hasNoEvalConfigsCache: vi.fn(),
    setNoEvalConfigsCache: vi.fn(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

import { prisma } from "@langfuse/shared/src/db";
import {
  hasNoEvalConfigsCache,
  setNoEvalConfigsCache,
} from "@langfuse/shared/src/server";
import { fetchObservationEvalConfigs } from "../fetchObservationEvalConfigs";

describe("fetchObservationEvalConfigs", () => {
  const projectId = "project-123";

  const mockConfig = {
    id: "config-1",
    projectId,
    filter: [],
    sampling: { toNumber: () => 1 },
    evalTemplateId: "template-1",
    scoreName: "quality",
    targetObject: EvalTargetObject.EVENT,
    variableMapping: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (hasNoEvalConfigsCache as Mock).mockResolvedValue(false);
    (prisma.jobConfiguration.findMany as Mock).mockResolvedValue([mockConfig]);
  });

  it("returns early when no-config cache is set", async () => {
    (hasNoEvalConfigsCache as Mock).mockResolvedValue(true);

    const result = await fetchObservationEvalConfigs(projectId);

    expect(result).toEqual([]);
    expect(prisma.jobConfiguration.findMany).not.toHaveBeenCalled();
    expect(setNoEvalConfigsCache).not.toHaveBeenCalled();
  });

  it("filters by timeScope NEW when requireTimeScopeNew is true", async () => {
    await fetchObservationEvalConfigs(projectId, { requireTimeScopeNew: true });

    expect(prisma.jobConfiguration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId,
          targetObject: {
            in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
          },
          status: "ACTIVE",
          timeScope: { has: "NEW" },
        }),
      }),
    );
  });

  it("does not filter by timeScope when requireTimeScopeNew is false", async () => {
    await fetchObservationEvalConfigs(projectId);

    const firstCallArgs = (prisma.jobConfiguration.findMany as Mock).mock
      .calls[0][0];
    expect(firstCallArgs.where.timeScope).toBeUndefined();
  });

  it("writes no-config cache when no configs are found", async () => {
    (prisma.jobConfiguration.findMany as Mock).mockResolvedValue([]);

    const result = await fetchObservationEvalConfigs(projectId, {
      requireTimeScopeNew: true,
    });

    expect(result).toEqual([]);
    expect(setNoEvalConfigsCache).toHaveBeenCalledWith(projectId, "eventBased");
  });
});
