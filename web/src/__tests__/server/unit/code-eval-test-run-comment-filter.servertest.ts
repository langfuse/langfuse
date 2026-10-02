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

const commentFilter = {
  type: "string" as const,
  column: "commentContent",
  operator: "contains" as const,
  value: "missing comment",
};
const filter = [commentFilter];
const prisma = {} as PrismaClient;
const previewParams = {
  prisma,
  orgId: "org-id",
  projectId: "project-id",
  evalTemplateId: "template-id",
  target: EvalTargetObject.EVENT,
  mapping: [],
  scoreName: "score-name",
  filter,
};

function resolveComments(filterState: unknown[], hasNoMatches = false) {
  mocks.applyCommentFilters.mockResolvedValue({
    filterState,
    hasNoMatches,
    matchingIds: [],
  });
}

describe("code-eval filter preview comment handling", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getEventsStreamForEval.mockResolvedValue(
      (async function* emptyStream() {})(),
    );
  });

  it("returns null without querying events when observation comment filters have no matches", async () => {
    resolveComments([], true);

    await expect(
      runCodeEvalTestForJobConfig(previewParams),
    ).resolves.toBeNull();
    expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
      filterState: filter,
      prisma,
      projectId: "project-id",
      objectType: "OBSERVATION",
    });
    expect(mocks.getEventsStreamForEval).not.toHaveBeenCalled();
  });

  it("queries one event with the resolved comment filter", async () => {
    const resolvedFilter = {
      type: "stringOptions" as const,
      column: "id",
      operator: "any of" as const,
      value: ["matching-observation"],
    };
    resolveComments([resolvedFilter]);

    await runCodeEvalTestForJobConfig(previewParams);
    expect(mocks.getEventsStreamForEval).toHaveBeenCalledWith({
      projectId: "project-id",
      filter: [resolvedFilter],
      rowLimit: 1,
    });
  });
});
