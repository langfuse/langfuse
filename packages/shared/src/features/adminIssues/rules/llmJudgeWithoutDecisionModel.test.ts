import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("../../../db", () => ({
  prisma: { evaluator: { findFirst } },
}));

import { llmJudgeWithoutDecisionModelRule } from "./llmJudgeWithoutDecisionModel";

describe("llmJudgeWithoutDecisionModelRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(null);
  });

  it("suggests a decision model only when an LLM judge exists without one", async () => {
    findFirst
      .mockResolvedValueOnce({ id: "judge" })
      .mockResolvedValueOnce(null);

    expect(
      await llmJudgeWithoutDecisionModelRule.callback!("project-a"),
    ).toEqual([
      {
        description: expect.stringContaining(
          "https://langfuse.com/docs/evaluation/evaluation-methods/jev-as-a-judge",
        ),
        priority: 5,
        ctaLink: "/project/project-a/evals",
      },
    ]);
    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: { projectId: "project-a", type: "LLM_AS_JUDGE" },
      select: { id: true },
    });
    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: { projectId: "project-a", type: "DECISION_MODEL" },
      select: { id: true },
    });
  });

  it("does not suggest a decision model when no LLM judge exists", async () => {
    expect(
      await llmJudgeWithoutDecisionModelRule.callback!("project-a"),
    ).toEqual([]);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("does not suggest a decision model when one already exists", async () => {
    findFirst
      .mockResolvedValueOnce({ id: "judge" })
      .mockResolvedValueOnce({ id: "decision" });

    expect(
      await llmJudgeWithoutDecisionModelRule.callback!("project-a"),
    ).toEqual([]);
  });
});
