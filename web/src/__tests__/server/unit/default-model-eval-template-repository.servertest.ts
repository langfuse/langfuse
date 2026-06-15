import { describe, expect, it, vi } from "vitest";
import { EvalTemplateType, type Prisma } from "@langfuse/shared/src/db";
import { findDefaultModelEvalTemplateIds } from "@/src/features/evals/server/defaultModelEvalTemplateRepository";

describe("findDefaultModelEvalTemplateIds", () => {
  it("only selects LLM-as-judge templates that depend on the default model", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "template-1" }]);
    const tx = {
      evalTemplate: {
        findMany,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      findDefaultModelEvalTemplateIds({
        tx,
        projectId: "project-123",
      }),
    ).resolves.toEqual(["template-1"]);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ projectId: "project-123" }, { projectId: null }],
        provider: null,
        model: null,
        type: EvalTemplateType.LLM_AS_JUDGE,
      },
      select: {
        id: true,
      },
    });
  });
});
