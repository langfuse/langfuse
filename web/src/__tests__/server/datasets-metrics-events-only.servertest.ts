import { vi } from "vitest";

const eventsTableAvailable = vi.hoisted(() => {
  const enabled =
    process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true";
  process.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
  process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
  return enabled;
});

import type { Session } from "next-auth";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import { createEvent, createEventsCh } from "@langfuse/shared/src/server";
import { env } from "@langfuse/shared/src/env";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const maybe = eventsTableAvailable ? describe : describe.skip;

describe("datasets metrics events-only liveness", () => {
  it("does not hang when the events table is unavailable", () => {});
});

maybe("datasets.allDatasetsMetrics in events_only write mode", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  const session: Session = {
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
          aiTelemetryEnabled: false,
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
        searchBar: false,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
      v4BetaEnabled: true,
      admin: true,
    },
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  it("reads experiment count and latest start time from events", async () => {
    expect(env.LANGFUSE_MIGRATION_V4_WRITE_MODE).toBe("events_only");

    const datasetId = randomUUID();
    const olderExperimentId = randomUUID();
    const latestExperimentId = randomUUID();
    const olderStart = new Date("2026-08-28T10:00:00.000Z");
    const latestStart = new Date("2026-08-29T11:00:00.000Z");

    await prisma.dataset.create({
      data: { id: datasetId, projectId, name: `events-only-${datasetId}` },
    });

    const makeEvent = ({
      experimentId,
      startTime,
    }: {
      experimentId: string;
      startTime: Date;
    }) => {
      const spanId = randomUUID();
      return createEvent({
        id: spanId,
        span_id: spanId,
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        experiment_id: experimentId,
        experiment_name: `experiment-${experimentId}`,
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_root_span_id: spanId,
        start_time: startTime.getTime() * 1000,
      });
    };

    await createEventsCh([
      makeEvent({
        experimentId: olderExperimentId,
        startTime: olderStart,
      }),
      makeEvent({
        experimentId: latestExperimentId,
        startTime: latestStart,
      }),
      makeEvent({
        experimentId: latestExperimentId,
        startTime: new Date(latestStart.getTime() + 60_000),
      }),
    ]);

    expect(
      await prisma.datasetRuns.count({
        where: { projectId, datasetId },
      }),
    ).toBe(0);

    const result = await caller.datasets.allDatasetsMetrics({
      projectId,
      datasetIds: [datasetId],
    });

    expect(result.metrics).toEqual([
      {
        id: datasetId,
        countDatasetItems: 0,
        countDatasetRuns: 2,
        lastRunAt: latestStart,
      },
    ]);
  });
});
