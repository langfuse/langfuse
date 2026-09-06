import { EvaluatorBlockReason } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  blockEvaluator,
  blockEvaluatorsInTx,
  blockEvaluatorsUsingDefaultModel,
  blockEvaluatorsUsingProvider,
  EvaluatorBlockSource,
  unblockEvaluatorsUsingDefaultModel,
} from "./blockEvaluators";

const updateMany = vi.fn();
const findProject = vi.fn();
const findEvaluators = vi.fn();
const dispatchProjectNotification = vi.fn();
const invalidateProjectEvalConfigCaches = vi.fn();
const recordIncrement = vi.fn();

vi.mock("../../db", () => ({
  prisma: {
    evaluator: {
      updateMany: (...args: unknown[]) => updateMany(...args),
      findMany: (...args: unknown[]) => findEvaluators(...args),
    },
    project: { findUnique: (...args: unknown[]) => findProject(...args) },
  },
}));
vi.mock("../evalJobConfigCache", () => ({
  invalidateProjectEvalConfigCaches: (...args: unknown[]) =>
    invalidateProjectEvalConfigCaches(...args),
}));
vi.mock("../instrumentation", () => ({
  recordIncrement: (...args: unknown[]) => recordIncrement(...args),
}));
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../notifications/dispatchProjectNotification", () => ({
  dispatchProjectNotification: (...args: unknown[]) =>
    dispatchProjectNotification(...args),
}));

const params = {
  projectId: "project-1",
  evaluatorId: "evaluator-1",
  blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
  blockMessage: "Authentication failed",
  source: EvaluatorBlockSource.LLM_COMPLETION_ERROR,
};

describe("blockEvaluator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findProject.mockResolvedValue({ name: "Project One" });
    findEvaluators.mockResolvedValue([{ id: "evaluator-1", name: "Quality" }]);
  });

  it("notifies the project when it blocks the evaluator", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    const result = await blockEvaluator(params);
    // The notification is dispatched in the background, so let it settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toEqual({ blockedEvaluatorIds: ["evaluator-1"] });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "evaluator-1",
          projectId: "project-1",
          blockedAt: null,
        },
      }),
    );
    expect(invalidateProjectEvalConfigCaches).toHaveBeenCalledWith("project-1");
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.evals.blocked_total",
      1,
      { reason: params.blockReason, source: params.source },
    );
    expect(dispatchProjectNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        event: expect.objectContaining({
          eventType: "evaluator-blocked",
          resourceId: "evaluator-1",
          resourceName: "Quality",
          blockReason: params.blockReason,
          evaluatorId: "evaluator-1",
        }),
      }),
    );
  });

  it("stays silent when the evaluator was already blocked", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const result = await blockEvaluator(params);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toEqual({ blockedEvaluatorIds: [] });
    expect(invalidateProjectEvalConfigCaches).not.toHaveBeenCalled();
    expect(recordIncrement).not.toHaveBeenCalled();
    expect(dispatchProjectNotification).not.toHaveBeenCalled();
  });
});

describe("blockEvaluatorsInTx", () => {
  const txFor = (claimable: Array<{ id: string }>) => {
    const findMany = vi.fn().mockResolvedValue(claimable);
    const updateManyInTx = vi
      .fn()
      .mockResolvedValue({ count: claimable.length });
    return {
      tx: {
        evaluator: { findMany, updateMany: updateManyInTx },
      } as never,
      findMany,
      updateManyInTx,
    };
  };

  it("only claims evaluators that are not already blocked", async () => {
    const blockedAt = new Date("2026-03-09T00:00:00.000Z");
    const { tx, findMany, updateManyInTx } = txFor([{ id: "evaluator-open" }]);

    await expect(
      blockEvaluatorsInTx({
        tx,
        projectId: "project-1",
        evaluatorIds: ["evaluator-open", "evaluator-already-blocked"],
        blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
        blockMessage: "LLM connection missing",
        blockedAt,
      }),
    ).resolves.toEqual({ blockedEvaluatorIds: ["evaluator-open"] });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["evaluator-open", "evaluator-already-blocked"] },
        projectId: "project-1",
        blockedAt: null,
      },
      select: { id: true },
    });
    // The claim is re-asserted on write so two concurrent deletions cannot
    // both report the same evaluator as newly blocked.
    expect(updateManyInTx).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        blockedAt: null,
        id: { in: ["evaluator-open"] },
      },
      data: {
        blockedAt,
        blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
        blockMessage: "LLM connection missing",
      },
    });
  });

  it("writes nothing when no evaluator is selected", async () => {
    const { tx, findMany, updateManyInTx } = txFor([]);

    await expect(
      blockEvaluatorsInTx({
        tx,
        projectId: "project-1",
        evaluatorIds: [],
        blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
        blockMessage: "LLM connection missing",
      }),
    ).resolves.toEqual({ blockedEvaluatorIds: [] });

    expect(findMany).not.toHaveBeenCalled();
    expect(updateManyInTx).not.toHaveBeenCalled();
  });
});

describe("model-usage selection", () => {
  /** Evaluators are keyed by their current version's provider/model. */
  const evaluatorRows = [
    { id: "openai-head", versions: [{ provider: "openai", model: "gpt-4o" }] },
    {
      id: "openai-history-only",
      // v2 upgraded off OpenAI: only the head version decides.
      versions: [{ provider: "anthropic", model: "claude" }],
    },
    { id: "default-model", versions: [{ provider: null, model: null }] },
    { id: "versionless", versions: [] },
  ];

  // The selector asks for versions; the subsequent claim asks for ids only.
  const txFor = () => {
    const evaluatorFindMany = vi.fn(
      async ({ select }: { select?: { versions?: unknown } }) =>
        select?.versions ? evaluatorRows : [],
    );
    return {
      tx: {
        evaluator: {
          findMany: evaluatorFindMany,
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      } as never,
      evaluatorFindMany,
    };
  };

  const claimedIds = (evaluatorFindMany: ReturnType<typeof vi.fn>) =>
    (
      evaluatorFindMany.mock.calls.at(-1)?.[0] as {
        where: { id?: { in: string[] } };
      }
    ).where.id?.in;

  it("selects evaluators whose current version pins the deleted provider", async () => {
    const { tx, evaluatorFindMany } = txFor();

    await blockEvaluatorsUsingProvider({
      tx,
      projectId: "project-1",
      provider: "openai",
    });

    expect(claimedIds(evaluatorFindMany)).toEqual(["openai-head"]);
  });

  it("selects evaluators that fall back to the default model", async () => {
    const { tx, evaluatorFindMany } = txFor();

    await blockEvaluatorsUsingDefaultModel({ tx, projectId: "project-1" });

    expect(claimedIds(evaluatorFindMany)).toEqual(["default-model"]);
  });
});

describe("unblockEvaluatorsUsingDefaultModel", () => {
  it("clears default-model blocks on evaluators", async () => {
    const evaluatorUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      evaluator: { updateMany: evaluatorUpdateMany },
    } as never;

    await expect(
      unblockEvaluatorsUsingDefaultModel({ tx, projectId: "project-1" }),
    ).resolves.toEqual({
      unblockedEvaluatorCount: 1,
    });

    const expectedUpdate = {
      where: {
        projectId: "project-1",
        blockReason: EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING,
      },
      data: {
        blockedAt: null,
        blockReason: null,
        blockMessage: null,
      },
    };
    expect(evaluatorUpdateMany).toHaveBeenCalledWith(expectedUpdate);
  });
});
