import type * as EventsServiceModule from "@/src/features/events/server/eventsService";

const mocks = vi.hoisted(() => ({
  getEventList: vi.fn(async () => ({ observations: [], hasMore: false })),
}));

vi.mock(
  "@/src/features/events/server/eventsService",
  async (importOriginal) => {
    const actual = await importOriginal<typeof EventsServiceModule>();

    return {
      ...actual,
      getEventList: mocks.getEventList,
    };
  },
);

import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";

import { eventsRouter } from "@/src/features/events/server/eventsRouter";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const createdSessionIds: string[] = [];

const createSession = async (isPublic: boolean) => {
  const sessionId = randomUUID();
  createdSessionIds.push(sessionId);
  await prisma.traceSession.create({
    data: { id: sessionId, projectId, public: isPublic },
  });
  return sessionId;
};

const caller = eventsRouter.createCaller({
  ...createInnerTRPCContext({ session: null, headers: {} }),
  prisma,
});

const memberCaller = eventsRouter.createCaller({
  ...createInnerTRPCContext({
    session: {
      expires: "1",
      user: {
        id: "user-1",
        name: "Test User",
        admin: false,
        canCreateOrganizations: true,
        featureFlags: {
          langfuseTopics: false,
          excludeClickhouseRead: false,
          experimentsV4Enabled: false,
          observationEvals: false,
          searchBar: false,
          templateFlag: false,
          v4BetaToggleVisible: false,
        },
        organizations: [
          {
            id: "org-1",
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
                role: "MEMBER",
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
    } satisfies Session,
    headers: {},
  }),
  prisma,
});

describe("events.sessionAll", () => {
  beforeEach(() => {
    mocks.getEventList.mockClear();
  });

  afterEach(async () => {
    await prisma.traceSession.deleteMany({
      where: { id: { in: createdSessionIds.splice(0) }, projectId },
    });
  });

  it("allows public access and enforces the authorized session filter", async () => {
    const sessionId = await createSession(true);
    const unauthorizedSessionId = randomUUID();

    await caller.sessionAll({
      projectId,
      sessionId,
      filter: [
        {
          column: "sessionId",
          type: "string",
          operator: "=",
          value: unauthorizedSessionId,
        },
      ],
      searchQuery: null,
      searchType: [],
      page: 2,
      limit: 25,
      orderBy: { column: "startTime", order: "ASC" },
    });

    expect(mocks.getEventList).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        page: 2,
        limit: 25,
        filter: [
          {
            column: "sessionId",
            type: "string",
            operator: "=",
            value: unauthorizedSessionId,
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

  it("rejects unauthenticated access to a private session", async () => {
    const sessionId = await createSession(false);

    await expect(
      caller.sessionAll({
        projectId,
        sessionId,
        filter: [],
        searchQuery: null,
        searchType: [],
        page: 1,
        limit: 25,
        orderBy: { column: "startTime", order: "ASC" },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mocks.getEventList).not.toHaveBeenCalled();
  });

  it("strips comment filters for public session viewers", async () => {
    const sessionId = await createSession(true);

    await caller.sessionAll({
      projectId,
      sessionId,
      filter: [
        {
          column: "commentContent",
          type: "string",
          operator: "contains",
          value: "private comment",
        },
        {
          column: "commentCount",
          type: "number",
          operator: ">=",
          value: 1,
        },
      ],
      searchQuery: null,
      searchType: [],
      page: 1,
      limit: 25,
      orderBy: { column: "startTime", order: "ASC" },
    });

    expect(mocks.getEventList).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: [
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

  it("keeps comment filters for project members", async () => {
    const sessionId = await createSession(false);

    await memberCaller.sessionAll({
      projectId,
      sessionId,
      filter: [
        {
          column: "commentContent",
          type: "string",
          operator: "contains",
          value: "missing comment",
        },
      ],
      searchQuery: null,
      searchType: [],
      page: 1,
      limit: 25,
      orderBy: { column: "startTime", order: "ASC" },
    });

    expect(mocks.getEventList).not.toHaveBeenCalled();
  });
});
