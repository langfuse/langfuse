import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/db")>()),
  prisma: {
    evaluationRule: {
      findMany: mocks.findMany,
    },
  },
}));

import { fetchScoreResultEvalRules } from "./fetchScoreResultEvalRules";

describe("fetchScoreResultEvalRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
  });

  it("queries rules independently for each evaluator in a project", async () => {
    await fetchScoreResultEvalRules({
      projectId: "project-1",
      evaluatorId: "evaluator-without-rules",
    });
    await fetchScoreResultEvalRules({
      projectId: "project-1",
      evaluatorId: "evaluator-with-rules",
    });

    expect(mocks.findMany).toHaveBeenCalledTimes(2);
    expect(mocks.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "project-1",
          triggerEvaluatorId: "evaluator-with-rules",
        }),
      }),
    );
  });
});
