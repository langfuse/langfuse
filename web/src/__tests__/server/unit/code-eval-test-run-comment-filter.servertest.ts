const mocks = vi.hoisted(() => ({
  applyCommentFilters: vi.fn(),
  getEventsStreamForEval: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServerModule>();

  return {
    ...actual,
    applyCommentFilters: mocks.applyCommentFilters,
    getEventsStreamForEval: mocks.getEventsStreamForEval,
  };
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvalTargetObject } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import type * as SharedServerModule from "@langfuse/shared/src/server";
import { runCodeEvalTestForJobConfig } from "@/src/features/evals/server/codeEvalTestRun";

describe("code-eval filter preview comment handling", () => {
  beforeEach(() => {
    mocks.applyCommentFilters.mockReset();
    mocks.getEventsStreamForEval.mockReset();
    mocks.getEventsStreamForEval.mockResolvedValue(
      (async function* emptyStream() {})(),
    );
  });

  it("returns null without querying events when observation comment filters have no matches", async () => {
    const prisma = {} as PrismaClient;
    const filter = [
      {
        type: "string" as const,
        column: "commentContent",
        operator: "contains" as const,
        value: "missing comment",
      },
    ];
    mocks.applyCommentFilters.mockResolvedValue({
      filterState: [],
      hasNoMatches: true,
      matchingIds: [],
    });

    const result = await runCodeEvalTestForJobConfig({
      prisma,
      orgId: "org-id",
      projectId: "project-id",
      evalTemplateId: "template-id",
      target: EvalTargetObject.EVENT,
      mapping: [],
      scoreName: "score-name",
      filter,
    });

    expect(result).toBeNull();
    expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
      filterState: filter,
      prisma,
      projectId: "project-id",
      objectType: "OBSERVATION",
    });
    expect(mocks.getEventsStreamForEval).not.toHaveBeenCalled();
  });
});
