import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { randomUUID } from "crypto";
import {
  createObservation,
  createObservationsCh,
} from "@langfuse/shared/src/server";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const makeSession = (v4BetaEnabled: boolean): Session => ({
  expires: "1",
  user: {
    id: "user-1",
    canCreateOrganizations: true,
    name: "Demo User",
    organizations: [
      {
        id: "seed-org-id",
        name: "Test Organization",
        role: "OWNER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: true,
        projects: [
          {
            id: projectId,
            role: "ADMIN",
            retentionDays: 30,
            deletedAt: null,
            name: "Test Project",
            hasTraces: true,
            metadata: {},
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
    featureFlags: {
      excludeClickhouseRead: false,
      templateFlag: true,
      v4BetaToggleVisible: false,
      observationEvals: false,
      experimentsV4Enabled: false,
      searchBar: false,
    },
    v4BetaEnabled,
    admin: true,
  },
  environment: {} as any,
});

const makeCaller = (v4BetaEnabled: boolean) => {
  const ctx = createInnerTRPCContext({
    session: makeSession(v4BetaEnabled),
    headers: {},
  });
  return appRouter.createCaller({ ...ctx, prisma });
};

describe("evals cost read path follows the session preview flag", () => {
  it("reads legacy-store costs for non-preview users even when the deployment writes events", async () => {
    const evaluatorId = randomUUID();
    await createObservationsCh([
      createObservation({
        project_id: projectId,
        type: "GENERATION",
        total_cost: 42,
        start_time: new Date().getTime(),
        metadata: { job_configuration_id: evaluatorId },
      }),
    ]);

    const result = await makeCaller(false).evals.costByEvaluatorIds({
      projectId,
      evaluatorIds: [evaluatorId],
    });

    expect(result[evaluatorId]).toBe(42);
  });

  it("reads events-store costs for preview users, ignoring legacy-only history", async () => {
    const evaluatorId = randomUUID();
    await createObservationsCh([
      createObservation({
        project_id: projectId,
        type: "GENERATION",
        total_cost: 42,
        start_time: new Date().getTime(),
        metadata: { job_configuration_id: evaluatorId },
      }),
    ]);

    const result = await makeCaller(true).evals.costByEvaluatorIds({
      projectId,
      evaluatorIds: [evaluatorId],
    });

    // Nothing was written to the events store, so a preview user must not see
    // the legacy-only cost.
    expect(result[evaluatorId]).toBeUndefined();
  });

  it("reads legacy-store average cost for non-preview users", async () => {
    const evaluatorId = randomUUID();
    await createObservationsCh([
      createObservation({
        project_id: projectId,
        type: "GENERATION",
        total_cost: 10,
        start_time: new Date().getTime(),
        metadata: { job_configuration_id: evaluatorId },
      }),
      createObservation({
        project_id: projectId,
        type: "GENERATION",
        total_cost: 20,
        start_time: new Date().getTime(),
        metadata: { job_configuration_id: evaluatorId },
      }),
    ]);

    const result = await makeCaller(false).evals.avgCostByEvaluatorIds({
      projectId,
      evaluatorIds: [evaluatorId],
    });

    expect(result[evaluatorId]).toEqual({ avgCost: 15, executionCount: 2 });
  });
});
