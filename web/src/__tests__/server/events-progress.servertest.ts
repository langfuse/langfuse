import type { Session } from "next-auth";
import { randomUUID } from "crypto";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import {
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

describe("events.allWithProgress", () => {
  it("streams a terminal event-list result", async () => {
    const setup = await createOrgProjectAndApiKey();
    const observationId = randomUUID();
    const traceId = randomUUID();

    await createEventsCh([
      createEvent({
        id: observationId,
        span_id: observationId,
        trace_id: traceId,
        project_id: setup.projectId,
        type: "SPAN",
        name: "progressive-event-list",
      }),
    ]);

    const session: Session = {
      expires: "1",
      user: {
        id: "progress-test-user",
        name: "Progress Test User",
        canCreateOrganizations: true,
        organizations: [
          {
            id: setup.orgId,
            name: "Progress Test Organization",
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            metadata: {},
            aiFeaturesEnabled: false,
            aiTelemetryEnabled: true,
            projects: [
              {
                id: setup.projectId,
                role: "ADMIN",
                name: "Progress Test Project",
                deletedAt: null,
                retentionDays: null,
                hasTraces: true,
                metadata: {},
                createdAt: new Date().toISOString(),
              },
            ],
          },
        ],
        featureFlags: {
          searchBar: false,
          templateFlag: true,
          excludeClickhouseRead: false,
          v4BetaToggleVisible: false,
          observationEvals: false,
          experimentsV4Enabled: false,
        },
        admin: false,
      },
      environment: {
        enableExperimentalFeatures: false,
        selfHostedInstancePlan: null,
      },
    };
    const ctx = createInnerTRPCContext({ session, headers: {} });
    const caller = appRouter.createCaller({ ...ctx, prisma });
    const stream = await caller.events.allWithProgress({
      projectId: setup.projectId,
      filter: [
        {
          type: "string",
          column: "id",
          operator: "=",
          value: observationId,
        },
      ],
      searchQuery: null,
      searchType: ["id", "content"],
      orderBy: { column: "startTime", order: "DESC" },
      page: 1,
      limit: 50,
    });

    const events = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: "progress",
      progress: expect.objectContaining({
        fraction: 1,
        phase: "enriching",
      }),
    });
    const result = events.find((event) => event.type === "result");
    expect(result?.data.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: observationId, traceId }),
      ]),
    );
  });
});
