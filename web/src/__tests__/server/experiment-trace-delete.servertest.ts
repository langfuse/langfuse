import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { EXPERIMENT_TRACE_DELETE_MAX_TRACES } from "@/src/features/experiments/server/deleteExperimentTraces";
import type { Session } from "next-auth";
import { randomUUID } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

const projectIds: string[] = [];

const createCaller = async () => {
  const { project, org } = await createOrgProjectAndApiKey({ plan: "Team" });
  projectIds.push(project.id);
  const session: Session = {
    expires: "1",
    user: {
      id: `user-${randomUUID()}`,
      name: "Experiment Delete Test User",
      canCreateOrganizations: true,
      admin: true,
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:team",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              hasTraces: true,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: testFeatureFlags(),
    },
    environment: {} as Session["environment"],
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  return {
    projectId: project.id,
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
};

const experimentEvent = ({
  projectId,
  experimentId,
  traceId,
  spanId = randomUUID(),
}: {
  projectId: string;
  experimentId: string;
  traceId: string;
  spanId?: string;
}) =>
  createEvent({
    id: spanId,
    span_id: spanId,
    project_id: projectId,
    trace_id: traceId,
    experiment_id: experimentId,
    start_time: new Date(),
  });

describe("experiments.deleteMany", () => {
  afterEach(async () => {
    if (projectIds.length === 0) return;
    await prisma.pendingDeletion.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        projectId: { in: projectIds },
        resourceType: "experiment",
      },
    });
    projectIds.length = 0;
  });

  it("deletes the distinct trace ids for the selected experiment ids", async () => {
    const { projectId, caller } = await createCaller();
    const otherProjectId = randomUUID();
    const experimentA = randomUUID();
    const experimentB = randomUUID();
    const experimentWithNoTraces = randomUUID();
    const unselectedExperiment = randomUUID();
    const traceA1 = randomUUID();
    const traceA2 = randomUUID();
    const traceB = randomUUID();
    const unselectedTrace = randomUUID();
    const otherProjectTrace = randomUUID();

    await createEventsCh([
      experimentEvent({
        projectId,
        experimentId: experimentA,
        traceId: traceA1,
      }),
      // Second span of the same trace must not delete the trace twice.
      experimentEvent({
        projectId,
        experimentId: experimentA,
        traceId: traceA1,
      }),
      experimentEvent({
        projectId,
        experimentId: experimentA,
        traceId: traceA2,
      }),
      experimentEvent({
        projectId,
        experimentId: experimentB,
        traceId: traceB,
      }),
      experimentEvent({
        projectId,
        experimentId: unselectedExperiment,
        traceId: unselectedTrace,
      }),
      experimentEvent({
        projectId: otherProjectId,
        experimentId: experimentA,
        traceId: otherProjectTrace,
      }),
    ]);

    await caller.experiments.deleteMany({
      projectId,
      experimentIds: [experimentA, experimentB, experimentWithNoTraces],
    });

    const pending = await prisma.pendingDeletion.findMany({
      where: { projectId, object: "trace" },
      select: { objectId: true },
    });
    expect(pending.map((row) => row.objectId).sort()).toEqual(
      [traceA1, traceA2, traceB].sort(),
    );

    const batchAction = await prisma.batchAction.findUnique({
      where: { id: `${projectId}-traces-trace-delete` },
    });
    expect(batchAction).toBeNull();

    const audits = await prisma.auditLog.findMany({
      where: { projectId, resourceType: "experiment", action: "delete" },
    });
    expect(audits).toHaveLength(3);
    expect(
      audits.map((row) => ({
        resourceId: row.resourceId,
        traceCount: JSON.parse(row.after ?? "{}").traceCount,
      })),
    ).toEqual(
      expect.arrayContaining([
        { resourceId: experimentA, traceCount: 2 },
        { resourceId: experimentB, traceCount: 1 },
        { resourceId: experimentWithNoTraces, traceCount: 0 },
      ]),
    );
  });

  it("deletes nothing when the distinct trace count is over the cap", async () => {
    const { projectId, caller } = await createCaller();
    const experimentId = randomUUID();
    const events = Array.from(
      { length: EXPERIMENT_TRACE_DELETE_MAX_TRACES + 1 },
      () =>
        experimentEvent({
          projectId,
          experimentId,
          traceId: randomUUID(),
        }),
    );
    await createEventsCh(events);

    await expect(
      caller.experiments.deleteMany({
        projectId,
        experimentIds: [experimentId],
      }),
    ).rejects.toThrow(
      "These experiments include more than 10,000 traces. Select fewer experiments, down to one at a time, and try again.",
    );

    const pendingCount = await prisma.pendingDeletion.count({
      where: { projectId },
    });
    expect(pendingCount).toBe(0);

    const auditCount = await prisma.auditLog.count({
      where: { projectId, resourceType: "experiment" },
    });
    expect(auditCount).toBe(0);
  }, 120_000);
});
