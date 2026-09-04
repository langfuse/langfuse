const mocks = vi.hoisted(() => ({
  applyCommentFilters: vi.fn(),
  getObservationsCountFromEventsTable: vi.fn(),
  getObservationsTableCount: vi.fn(),
  queueAdd: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServerModule>();

  return {
    ...actual,
    applyCommentFilters: mocks.applyCommentFilters,
    getObservationsCountFromEventsTable:
      mocks.getObservationsCountFromEventsTable,
    getObservationsTableCount: mocks.getObservationsTableCount,
    BatchActionQueue: {
      getInstance: vi.fn(() => ({ add: mocks.queueAdd })),
    },
  };
});

vi.mock("@/src/features/audit-logs/auditLog", () => ({
  auditLog: vi.fn(),
}));

import type { Session } from "next-auth";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@langfuse/shared/src/db";
import type * as SharedServerModule from "@langfuse/shared/src/server";
import {
  BatchEvalSourceTable,
  InvalidRequestError,
  type BatchActionQuery,
} from "@langfuse/shared";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { addToDatasetRouter } from "@/src/features/batch-actions/server/addToDatasetRouter";
import { runEvaluationRouter } from "@/src/features/batch-actions/server/runEvaluationRouter";
import { env } from "@/src/env.mjs";

const mutableEnv = env as unknown as {
  LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN: "true" | "false";
};
const originalPreviewOptIn =
  mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN;

const projectId = "project-id";
const evaluatorId = "evaluator-id";
const rawCommentFilter = {
  type: "string" as const,
  column: "commentContent",
  operator: "contains" as const,
  value: "needs-review",
};
const resolvedIdFilter = {
  type: "stringOptions" as const,
  column: "id",
  operator: "any of" as const,
  value: ["matching-observation"],
};
const query: BatchActionQuery = {
  filter: [rawCommentFilter],
  orderBy: null,
};
const datasetConfig = {
  datasetId: "dataset-id",
  datasetName: "Dataset",
  mapping: {
    input: { mode: "none" as const },
    expectedOutput: { mode: "none" as const },
    metadata: { mode: "none" as const },
  },
};

const session = {
  expires: "1",
  user: {
    id: "user-id",
    organizations: [
      {
        id: "org-id",
        role: "OWNER",
        projects: [
          {
            id: projectId,
            role: "ADMIN",
          },
        ],
      },
    ],
  },
} as Session;

function prepare({
  v4BetaEnabled = false,
  foundEvaluatorIds = [evaluatorId],
  missingPromptVariable = false,
} = {}) {
  const batchActionCreate = vi
    .fn()
    .mockResolvedValue({ id: "batch-action-id" });
  const prisma = {
    batchAction: { create: batchActionCreate },
    jobConfiguration: {
      findMany: vi.fn(async () => [{ id: evaluatorId }]),
    },
    evaluationRule: {
      findMany: vi.fn(async () => [{ id: evaluatorId }]),
    },
    evaluator: {
      findMany: vi.fn(async (args?: { select?: { id?: boolean } }) => {
        if (args?.select?.id) {
          return foundEvaluatorIds.map((id) => ({ id }));
        }
        return foundEvaluatorIds.map((id) => ({
          id,
          name: "Quality",
          type: "LLM_AS_JUDGE",
          versions: [
            {
              prompt: missingPromptVariable
                ? "Evaluate {{output}} {{input}}"
                : "Evaluate {{output}}",
              promptMessages: [
                {
                  role: "user",
                  content: missingPromptVariable
                    ? "Evaluate {{output}} {{input}}"
                    : "Evaluate {{output}}",
                },
              ],
              variableMapping: [
                {
                  templateVariable: "output",
                  selectedColumnId: "output",
                },
              ],
            },
          ],
        }));
      }),
    },
  } as unknown as PrismaClient;
  const ctx = {
    ...createInnerTRPCContext({
      session: {
        ...session,
        user: { ...session.user, v4BetaEnabled },
      } as Session,
      headers: {},
    }),
    prisma,
  };

  return {
    prisma,
    batchActionCreate,
    addToDataset: addToDatasetRouter.createCaller(ctx),
    runEvaluation: runEvaluationRouter.createCaller(ctx),
  };
}

type TestContext = ReturnType<typeof prepare>;
type Action = "add-to-dataset" | "run-evaluation";
const actions = [
  { label: "add-to-dataset", action: "add-to-dataset" },
  { label: "evaluation", action: "run-evaluation" },
] as const;

function runAction(action: Action, context: TestContext) {
  return action === "add-to-dataset"
    ? context.addToDataset.create({ projectId, query, config: datasetConfig })
    : context.runEvaluation.create({
        projectId,
        query,
        evaluatorIds: [evaluatorId],
        sourceTable: BatchEvalSourceTable.EVENTS,
      });
}

function resolveComments(hasNoMatches = false) {
  mocks.applyCommentFilters.mockResolvedValue({
    filterState: hasNoMatches ? [] : [resolvedIdFilter],
    hasNoMatches,
    matchingIds: hasNoMatches ? [] : resolvedIdFilter.value,
  });
}

describe("event batch-action comment filter preflight", () => {
  beforeEach(() => {
    mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getObservationsCountFromEventsTable.mockResolvedValue(1);
    mocks.getObservationsTableCount.mockResolvedValue(1);
    mocks.queueAdd.mockResolvedValue(undefined);
  });

  afterAll(() => {
    mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN =
      originalPreviewOptIn;
  });

  it.each(actions)(
    "uses resolved comment filters for the $label count",
    async ({ action }) => {
      const context = prepare();
      resolveComments();

      await runAction(action, context);

      expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
        filterState: query.filter,
        prisma: context.prisma,
        projectId,
        objectType: "OBSERVATION",
      });
      expect(mocks.getObservationsCountFromEventsTable).toHaveBeenCalledWith(
        expect.objectContaining({ filter: [resolvedIdFilter] }),
      );
      expect(context.batchActionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ query }),
        }),
      );
      expect(mocks.queueAdd).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          payload: expect.objectContaining({ query }),
        }),
        expect.anything(),
      );
    },
  );

  it.each(actions)(
    "skips the $label count when comment filters have no matches",
    async ({ action }) => {
      const context = prepare();
      resolveComments(true);

      await runAction(action, context);

      expect(mocks.getObservationsCountFromEventsTable).not.toHaveBeenCalled();
    },
  );

  it("uses resolved comment filters for the legacy Observation count", async () => {
    mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
    const context = prepare();
    resolveComments();

    await runAction("add-to-dataset", context);

    expect(mocks.getObservationsTableCount).toHaveBeenCalledWith(
      expect.objectContaining({ filter: [resolvedIdFilter] }),
    );
    expect(mocks.getObservationsCountFromEventsTable).not.toHaveBeenCalled();
  });

  it.each(actions)(
    "returns a comment-filter threshold as a $label bad request",
    async ({ action }) => {
      const context = prepare();
      mocks.applyCommentFilters.mockRejectedValue(
        new InvalidRequestError("comment-filter threshold"),
      );

      await expect(runAction(action, context)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "comment-filter threshold",
      });
    },
  );
});

describe("batched evaluation version selection", () => {
  beforeEach(() => {
    mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getObservationsCountFromEventsTable.mockResolvedValue(1);
    mocks.queueAdd.mockResolvedValue(undefined);
    resolveComments();
  });

  it("validates and queues stable evaluators for fast-preview users", async () => {
    const context = prepare({ v4BetaEnabled: true });

    await context.runEvaluation.create({
      projectId,
      query,
      evaluatorIds: [evaluatorId],
      sourceTable: BatchEvalSourceTable.EVENTS,
      evalVersion: "v2",
    });

    expect(context.prisma.evaluator.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [evaluatorId] },
        projectId,
        assignments: {
          none: {
            evaluationRule: {
              targetObject: { in: ["trace", "dataset"] },
            },
          },
        },
      },
      select: { id: true },
    });
    expect(context.prisma.jobConfiguration.findMany).not.toHaveBeenCalled();
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({ evalVersion: "v2" }),
      }),
      expect.anything(),
    );
  });

  it("rejects evaluator v2 for users outside fast preview", async () => {
    const context = prepare();

    await expect(
      context.runEvaluation.create({
        projectId,
        query,
        evaluatorIds: [evaluatorId],
        sourceTable: BatchEvalSourceTable.EVENTS,
        evalVersion: "v2",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(context.prisma.evaluator.findMany).not.toHaveBeenCalled();
  });

  it("rejects legacy-backed evaluators that are not batch eligible", async () => {
    const context = prepare({
      v4BetaEnabled: true,
      foundEvaluatorIds: [],
    });

    await expect(
      context.runEvaluation.create({
        projectId,
        query,
        evaluatorIds: [evaluatorId],
        sourceTable: BatchEvalSourceTable.EVENTS,
        evalVersion: "v2",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: `Evaluators [${evaluatorId}] are missing or incompatible with batch evaluation.`,
    });

    expect(context.batchActionCreate).not.toHaveBeenCalled();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("queues mapping overrides on the batch-eval payload", async () => {
    const context = prepare({ v4BetaEnabled: true });
    const evaluatorMappings = [
      {
        evaluatorId,
        variableMapping: [
          { templateVariable: "output", selectedColumnId: "input" },
        ],
      },
    ];

    await context.runEvaluation.create({
      projectId,
      query,
      evaluatorIds: [evaluatorId],
      sourceTable: BatchEvalSourceTable.EVENTS,
      evalVersion: "v2",
      evaluatorMappings,
    });

    expect(context.prisma.evaluator.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true } }),
    );
    expect(context.prisma.evaluator.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ versions: expect.anything() }),
      }),
    );
    expect(context.batchActionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({
            evalVersion: "v2",
            evaluatorMappings,
          }),
        }),
      }),
    );
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({
          evalVersion: "v2",
          evaluatorMappings,
        }),
      }),
      expect.anything(),
    );
  });

  it("rejects mapping overrides without evaluator v2", async () => {
    const context = prepare({ v4BetaEnabled: true });

    await expect(
      context.runEvaluation.create({
        projectId,
        query,
        evaluatorIds: [evaluatorId],
        sourceTable: BatchEvalSourceTable.EVENTS,
        evaluatorMappings: [
          {
            evaluatorId,
            variableMapping: [
              { templateVariable: "output", selectedColumnId: "output" },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(context.batchActionCreate).not.toHaveBeenCalled();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("rejects a mapping override for an unselected evaluator", async () => {
    const context = prepare({ v4BetaEnabled: true });

    await expect(
      context.runEvaluation.create({
        projectId,
        query,
        evaluatorIds: [evaluatorId],
        sourceTable: BatchEvalSourceTable.EVENTS,
        evalVersion: "v2",
        evaluatorMappings: [
          {
            evaluatorId: "other-evaluator",
            variableMapping: null,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(context.batchActionCreate).not.toHaveBeenCalled();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("rejects more than 100 evaluators", async () => {
    const context = prepare({ v4BetaEnabled: true });

    await expect(
      context.runEvaluation.create({
        projectId,
        query,
        evaluatorIds: Array.from(
          { length: 101 },
          (_, index) => `evaluator-${index}`,
        ),
        sourceTable: BatchEvalSourceTable.EVENTS,
        evalVersion: "v2",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(context.batchActionCreate).not.toHaveBeenCalled();
  });

  it("names the evaluator when a mapping is incomplete", async () => {
    const context = prepare({
      v4BetaEnabled: true,
      missingPromptVariable: true,
    });

    await expect(
      context.runEvaluation.create({
        projectId,
        query,
        evaluatorIds: [evaluatorId],
        sourceTable: BatchEvalSourceTable.EVENTS,
        evalVersion: "v2",
        evaluatorMappings: [{ evaluatorId, variableMapping: null }],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining('Evaluator "Quality"'),
    });

    expect(context.batchActionCreate).not.toHaveBeenCalled();
  });
});
