const mocks = vi.hoisted(() => ({
  applyCommentFilters: vi.fn(),
  getObservationsWithModelDataFromEventsTable: vi.fn(async () => []),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServerModule>();

  return {
    ...actual,
    applyCommentFilters: mocks.applyCommentFilters,
    getObservationsWithModelDataFromEventsTable:
      mocks.getObservationsWithModelDataFromEventsTable,
  };
});

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@langfuse/shared/src/db";
import type * as SharedServerModule from "@langfuse/shared/src/server";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { sessionRouter } from "@/src/server/api/routers/sessions";

const projectId = "project-id";
const sessionId = "session-id";
const traceId = "trace-id";
const commentContentFilter = {
  column: "commentContent",
  type: "string" as const,
  operator: "contains" as const,
  value: "needs-review",
};
const commentCountFilter = {
  column: "commentCount",
  type: "number" as const,
  operator: ">=" as const,
  value: 1,
};
const resolvedIdFilter = {
  type: "stringOptions" as const,
  column: "id",
  operator: "any of" as const,
  value: ["matching-observation"],
};

function prepare({
  isPublic = false,
  projectRole = "MEMBER" as const,
  authenticated = true,
} = {}) {
  const prisma = {
    traceSession: {
      findFirst: vi.fn(async () => ({ public: isPublic })),
    },
  } as unknown as PrismaClient;

  const session = authenticated
    ? ({
        expires: "1",
        user: {
          id: "user-id",
          name: "Test User",
          admin: false,
          canCreateOrganizations: true,
          featureFlags: testFeatureFlags({ templateFlag: false }),
          organizations: [
            {
              id: "org-id",
              name: "Test Organization",
              role: "MEMBER",
              plan: "cloud:hobby",
              cloudConfig: undefined,
              metadata: {},
              aiFeaturesEnabled: false,
              aiTelemetryEnabled: false,
              projects: [
                {
                  id: projectId,
                  role: projectRole,
                  retentionDays: 30,
                  deletedAt: null,
                  name: "Test Project",
                  hasTraces: false,
                  metadata: {},
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          ],
        },
        environment: {
          enableExperimentalFeatures: false,
          selfHostedInstancePlan: null,
        },
      } satisfies Session)
    : null;

  const caller = sessionRouter.createCaller({
    ...createInnerTRPCContext({ session, headers: {} }),
    prisma,
  });

  return { caller, prisma };
}

function resolveComments(hasNoMatches = false) {
  mocks.applyCommentFilters.mockResolvedValue({
    filterState: hasNoMatches ? [] : [resolvedIdFilter],
    hasNoMatches,
    matchingIds: hasNoMatches ? [] : resolvedIdFilter.value,
  });
}

describe("sessions.observationsForTraceFromEvents comment filters", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getObservationsWithModelDataFromEventsTable.mockResolvedValue([]);
  });

  it("returns an empty array when observation comment filters match nothing", async () => {
    const { caller, prisma } = prepare();
    resolveComments(true);

    const result = await caller.observationsForTraceFromEvents({
      projectId,
      sessionId,
      traceId,
      filter: [commentContentFilter],
    });

    expect(result).toEqual([]);
    expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
      filterState: [commentContentFilter],
      prisma,
      projectId,
      objectType: "OBSERVATION",
    });
    expect(
      mocks.getObservationsWithModelDataFromEventsTable,
    ).not.toHaveBeenCalled();
  });

  it("resolves comment filters to observation ids before querying events", async () => {
    const { caller, prisma } = prepare();
    resolveComments();

    await caller.observationsForTraceFromEvents({
      projectId,
      sessionId,
      traceId,
      filter: [commentContentFilter, commentCountFilter],
    });

    expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
      filterState: [commentContentFilter, commentCountFilter],
      prisma,
      projectId,
      objectType: "OBSERVATION",
    });
    expect(
      mocks.getObservationsWithModelDataFromEventsTable,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        filter: [
          resolvedIdFilter,
          {
            column: "traceId",
            type: "string",
            operator: "=",
            value: traceId,
          },
          {
            column: "sessionId",
            type: "string",
            operator: "=",
            value: sessionId,
          },
        ],
      }),
    );
  });

  it("strips comment filters for public session viewers", async () => {
    const { caller } = prepare({ isPublic: true, authenticated: false });
    resolveComments();

    await caller.observationsForTraceFromEvents({
      projectId,
      sessionId,
      traceId,
      filter: [commentContentFilter, commentCountFilter],
    });

    expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
      filterState: [],
      prisma: expect.anything(),
      projectId,
      objectType: "OBSERVATION",
    });
  });
});
