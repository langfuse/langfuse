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

function prepare() {
  const batchActionCreate = vi
    .fn()
    .mockResolvedValue({ id: "batch-action-id" });
  const prisma = {
    batchAction: { create: batchActionCreate },
    jobConfiguration: {
      findMany: vi.fn(async () => [{ id: evaluatorId }]),
    },
  } as unknown as PrismaClient;
  const ctx = {
    ...createInnerTRPCContext({ session, headers: {} }),
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
