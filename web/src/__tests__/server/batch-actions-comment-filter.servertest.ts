const mocks = vi.hoisted(() => {
  return {
    applyCommentFilters: vi.fn(),
    getObservationsCountFromEventsTable: vi.fn(),
    getObservationsTableCount: vi.fn(),
    queueAdd: vi.fn(),
  };
});

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

import { randomUUID } from "node:crypto";
import type { Session } from "next-auth";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@langfuse/shared/src/db";
import type * as SharedServerModule from "@langfuse/shared/src/server";
import {
  BatchEvalSourceTable,
  InvalidRequestError,
  type BatchActionQuery,
} from "@langfuse/shared";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { env } from "@/src/env.mjs";

const mutableEnv = env as unknown as {
  LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN: "true" | "false";
};
const originalPreviewOptIn =
  mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN;

const commentFilter = {
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
  filter: [commentFilter],
  orderBy: null,
  searchQuery: "search text",
  searchType: ["id"],
};

async function prepare() {
  const projectId = `project-${randomUUID()}`;
  const orgId = `org-${randomUUID()}`;
  const batchActionCreate = vi.fn(async ({ data }) => ({
    id: `batch-action-${randomUUID()}`,
    ...data,
  }));
  const jobConfigurationFindMany = vi.fn(
    async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({ id })),
  );
  const fakePrisma = {
    batchAction: { create: batchActionCreate },
    jobConfiguration: { findMany: jobConfigurationFindMany },
  } as unknown as PrismaClient;

  const session: Session = {
    expires: "1",
    user: {
      id: `user-${randomUUID()}`,
      name: "Batch Comment Filter User",
      admin: true,
      canCreateOrganizations: true,
      organizations: [
        {
          id: orgId,
          name: "Test organization",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test project",
              hasTraces: false,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
        searchBar: false,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
    },
    environment: {} as Session["environment"],
  };

  const caller = appRouter.createCaller({
    ...createInnerTRPCContext({ session, headers: {} }),
    prisma: fakePrisma,
  });

  return {
    caller,
    projectId,
    fakePrisma,
    batchActionCreate,
  };
}

const datasetConfig = {
  datasetId: "dataset-id",
  datasetName: "Dataset",
  mapping: {
    input: { mode: "none" as const },
    expectedOutput: { mode: "none" as const },
    metadata: { mode: "none" as const },
  },
};

describe("event batch-action comment filter preflight", () => {
  beforeEach(() => {
    mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
    mocks.applyCommentFilters.mockReset();
    mocks.getObservationsCountFromEventsTable.mockReset();
    mocks.getObservationsTableCount.mockReset();
    mocks.queueAdd.mockReset();
    mocks.getObservationsCountFromEventsTable.mockResolvedValue(1);
    mocks.getObservationsTableCount.mockResolvedValue(1);
    mocks.queueAdd.mockResolvedValue(undefined);
  });

  afterAll(() => {
    mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN =
      originalPreviewOptIn;
  });

  it("counts add-to-dataset matches with resolved filters but persists the original query", async () => {
    const { caller, projectId, fakePrisma, batchActionCreate } =
      await prepare();
    mocks.applyCommentFilters.mockResolvedValue({
      filterState: [resolvedIdFilter],
      hasNoMatches: false,
      matchingIds: resolvedIdFilter.value,
    });

    const result = await caller.batchAction.addToDataset.create({
      projectId,
      query,
      config: datasetConfig,
    });

    expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
      filterState: query.filter,
      prisma: fakePrisma,
      projectId,
      objectType: "OBSERVATION",
    });
    expect(mocks.getObservationsCountFromEventsTable).toHaveBeenCalledWith(
      expect.objectContaining({ filter: [resolvedIdFilter] }),
    );

    expect(result.id).toEqual(expect.any(String));
    expect(batchActionCreate.mock.calls[0]?.[0].data.query).toMatchObject({
      filter: [commentFilter],
    });
    expect(mocks.queueAdd.mock.calls[0]?.[1].payload.query).toMatchObject({
      filter: [commentFilter],
    });
  });

  it("skips the add-to-dataset count query when comment filters have no matches", async () => {
    const { caller, projectId, batchActionCreate } = await prepare();
    mocks.applyCommentFilters.mockResolvedValue({
      filterState: [],
      hasNoMatches: true,
      matchingIds: [],
    });

    const result = await caller.batchAction.addToDataset.create({
      projectId,
      query,
      config: datasetConfig,
    });

    expect(mocks.getObservationsCountFromEventsTable).not.toHaveBeenCalled();
    expect(result.id).toEqual(expect.any(String));
    expect(batchActionCreate.mock.calls[0]?.[0].data.query).toMatchObject({
      filter: [commentFilter],
    });
  });

  it("counts legacy Observation matches with resolved comment filters", async () => {
    mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";
    const { caller, projectId } = await prepare();
    mocks.applyCommentFilters.mockResolvedValue({
      filterState: [resolvedIdFilter],
      hasNoMatches: false,
      matchingIds: resolvedIdFilter.value,
    });

    await caller.batchAction.addToDataset.create({
      projectId,
      query,
      config: datasetConfig,
    });

    expect(mocks.applyCommentFilters).toHaveBeenCalledWith(
      expect.objectContaining({ filterState: query.filter }),
    );
    expect(mocks.getObservationsTableCount).toHaveBeenCalledWith(
      expect.objectContaining({ filter: [resolvedIdFilter] }),
    );
    expect(mocks.getObservationsCountFromEventsTable).not.toHaveBeenCalled();
  });

  it("returns the comment-filter threshold as an add-to-dataset bad request", async () => {
    const { caller, projectId } = await prepare();
    const message =
      "Comment filter matches 50,001 observations (limit: 50,000). Please add additional filters to narrow your search.";
    mocks.applyCommentFilters.mockRejectedValue(
      new InvalidRequestError(message),
    );

    await expect(
      caller.batchAction.addToDataset.create({
        projectId,
        query,
        config: datasetConfig,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message });
    expect(mocks.getObservationsCountFromEventsTable).not.toHaveBeenCalled();
  });

  it("counts evaluation matches with resolved filters but persists the original query", async () => {
    const { caller, projectId, fakePrisma, batchActionCreate } =
      await prepare();
    const evaluatorId = await createEventEvaluator(projectId);
    mocks.applyCommentFilters.mockResolvedValue({
      filterState: [resolvedIdFilter],
      hasNoMatches: false,
      matchingIds: resolvedIdFilter.value,
    });

    const result = await caller.batchAction.runEvaluation.create({
      projectId,
      query,
      evaluatorIds: [evaluatorId],
      sourceTable: BatchEvalSourceTable.EVENTS,
    });

    expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
      filterState: query.filter,
      prisma: fakePrisma,
      projectId,
      objectType: "OBSERVATION",
    });
    expect(mocks.getObservationsCountFromEventsTable).toHaveBeenCalledWith(
      expect.objectContaining({ filter: [resolvedIdFilter] }),
    );

    expect(result.id).toEqual(expect.any(String));
    expect(batchActionCreate.mock.calls[0]?.[0].data.query).toMatchObject({
      filter: [commentFilter],
    });
    expect(mocks.queueAdd.mock.calls[0]?.[1].payload.query).toMatchObject({
      filter: [commentFilter],
    });
  });

  it("skips the evaluation count query when comment filters have no matches", async () => {
    const { caller, projectId, batchActionCreate } = await prepare();
    const evaluatorId = await createEventEvaluator(projectId);
    mocks.applyCommentFilters.mockResolvedValue({
      filterState: [],
      hasNoMatches: true,
      matchingIds: [],
    });

    const result = await caller.batchAction.runEvaluation.create({
      projectId,
      query,
      evaluatorIds: [evaluatorId],
      sourceTable: BatchEvalSourceTable.EVENTS,
    });

    expect(mocks.getObservationsCountFromEventsTable).not.toHaveBeenCalled();
    expect(result.id).toEqual(expect.any(String));
    expect(batchActionCreate.mock.calls[0]?.[0].data.query).toMatchObject({
      filter: [commentFilter],
    });
  });

  it("returns the comment-filter threshold as an evaluation bad request", async () => {
    const { caller, projectId } = await prepare();
    const evaluatorId = await createEventEvaluator(projectId);
    const message =
      "Comment filter matches 50,001 observations (limit: 50,000). Please add additional filters to narrow your search.";
    mocks.applyCommentFilters.mockRejectedValue(
      new InvalidRequestError(message),
    );

    await expect(
      caller.batchAction.runEvaluation.create({
        projectId,
        query,
        evaluatorIds: [evaluatorId],
        sourceTable: BatchEvalSourceTable.EVENTS,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message });
    expect(mocks.getObservationsCountFromEventsTable).not.toHaveBeenCalled();
  });
});

async function createEventEvaluator(projectId: string) {
  return `comment-filter-evaluator-${projectId}-${randomUUID()}`;
}
