/* eslint-disable @typescript-eslint/no-use-before-define */
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
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

import { eventsRouter } from "@/src/features/events/server/eventsRouter";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const createdSessionIds: string[] = [];

const createTraceSession = async (isPublic: boolean) => {
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
    session: createSession({
      user: {
        name: "Test User",
        featureFlags: testFeatureFlags({ templateFlag: false }),
      },
      organizations: [
        { id: "org-1", role: "MEMBER", projects: [{ id: projectId }] },
      ],
    }),
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
    const sessionId = await createTraceSession(true);
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
    const sessionId = await createTraceSession(false);

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
    const sessionId = await createTraceSession(true);

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
    const sessionId = await createTraceSession(false);

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
