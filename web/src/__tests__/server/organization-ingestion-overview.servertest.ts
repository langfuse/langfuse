import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { randomUUID } from "crypto";
import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";

import { prisma } from "@langfuse/shared/src/db";
import {
  createEvent,
  createEventsCh,
  createScoresCh,
  createTraceScore,
} from "@langfuse/shared/src/server";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

async function setupOrganization() {
  const orgId = randomUUID();
  const userId = randomUUID();
  const organization = await prisma.organization.create({
    data: { id: orgId, name: "Ingestion Overview Org" },
  });
  const [busyProject, idleProject, inaccessibleProject] = await Promise.all(
    ["busy", "idle", "inaccessible"].map((name) =>
      prisma.project.create({
        data: { id: randomUUID(), orgId, name: `${name}-${orgId}` },
      }),
    ),
  );
  const user = await prisma.user.create({
    data: { id: userId, email: `${userId}@example.com`, name: "Viewer" },
  });

  const toSessionProject = (project: typeof busyProject) => ({
    id: project.id,
    name: project.name,
    role: "VIEWER" as const,
    deletedAt: null,
    retentionDays: null,
    hasTraces: false,
    metadata: {},
    createdAt: project.createdAt.toISOString(),
  });

  const session: Session = {
    expires: "1",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      canCreateOrganizations: true,
      organizations: [
        {
          id: organization.id,
          name: organization.name,
          role: "MEMBER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [
            toSessionProject(busyProject),
            toSessionProject(idleProject),
          ],
        },
      ],
      featureFlags: testFeatureFlags({ templateFlag: false }),
      admin: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  return {
    orgId,
    busyProject,
    idleProject,
    inaccessibleProject,
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
}

describe("organizationIngestion.overview", () => {
  it("attributes events and scores to clients per project with week-over-week counts", async () => {
    const { orgId, busyProject, idleProject, inaccessibleProject, caller } =
      await setupOrganization();

    const pythonSdk = {
      ingestion_sdk_name: "python",
      ingestion_sdk_version: "4.1.0",
      ingestion_api_key: "pk-lf-python",
    };

    await createEventsCh([
      ...[1, 2, 3].map((day) =>
        createEvent({
          project_id: busyProject.id,
          source: "otel",
          start_time: daysAgo(day),
          ...pythonSdk,
        }),
      ),
      createEvent({
        project_id: busyProject.id,
        source: "otel",
        start_time: daysAgo(10),
        ...pythonSdk,
      }),
      ...[8, 9].map((day) =>
        createEvent({
          project_id: busyProject.id,
          source: "otel-dual-write",
          start_time: daysAgo(day),
          ingestion_sdk_name: "unknown",
          ingestion_sdk_version: "unknown",
          ingestion_api_key: "pk-lf-custom",
        }),
      ),
      createEvent({
        project_id: busyProject.id,
        source: "ingestion-api-dual-write",
        environment: "langfuse-llm-as-a-judge",
        start_time: daysAgo(1),
      }),
      // Outside both windows, excluded source, and inaccessible project.
      createEvent({
        project_id: busyProject.id,
        source: "otel",
        start_time: daysAgo(20),
        ...pythonSdk,
      }),
      createEvent({
        project_id: busyProject.id,
        source: "API",
        start_time: daysAgo(1),
        ...pythonSdk,
      }),
      createEvent({
        project_id: inaccessibleProject.id,
        source: "otel",
        start_time: daysAgo(1),
        ...pythonSdk,
      }),
    ]);

    await createScoresCh([
      ...[1, 2].map((day) =>
        createTraceScore({
          project_id: busyProject.id,
          source: "API",
          timestamp: daysAgo(day),
          ...pythonSdk,
        }),
      ),
      createTraceScore({
        project_id: busyProject.id,
        source: "EVAL",
        timestamp: daysAgo(1),
      }),
      createTraceScore({
        project_id: busyProject.id,
        source: "ANNOTATION",
        timestamp: daysAgo(8),
      }),
    ]);

    const overview = await caller.organizationIngestion.overview({ orgId });

    expect(overview.projects.map((project) => project.projectId)).toEqual([
      busyProject.id,
      idleProject.id,
    ]);

    const busy = overview.projects[0]!;
    expect(busy.status).toBe("active");
    expect(busy.events).toEqual({
      current: 4,
      previous: 3,
      changePct: (1 / 3) * 100,
    });
    expect(busy.scores).toMatchObject({ current: 3, previous: 1 });
    expect(busy.scores.bySource).toEqual({
      API: { current: 2, previous: 0, changePct: null },
      EVAL: { current: 1, previous: 0, changePct: null },
      ANNOTATION: { current: 0, previous: 1, changePct: -100 },
    });

    expect(busy.clients).toEqual([
      expect.objectContaining({
        clientType: "langfuse_sdk",
        sdkName: "python",
        sdkVersion: "4.1.0",
        canonicalSdkName: "python",
        sdkUpgradeStatus: "current",
        ingestionPaths: ["ingestion_api", "otel"],
        publicKey: "pk-lf-python",
        status: "active",
        events: { current: 3, previous: 1, changePct: 200 },
        scores: { current: 2, previous: 0, changePct: null },
      }),
      expect.objectContaining({
        clientType: "langfuse_internal",
        ingestionPaths: ["ingestion_api"],
        status: "new",
        events: { current: 1, previous: 0, changePct: null },
      }),
      expect.objectContaining({
        clientType: "custom_otel",
        sdkName: "unknown",
        sdkUpgradeStatus: "unknown",
        publicKey: "pk-lf-custom",
        status: "stopped",
        events: { current: 0, previous: 2, changePct: -100 },
      }),
    ]);

    expect(overview.projects[1]).toMatchObject({
      projectId: idleProject.id,
      status: "idle",
      events: { current: 0, previous: 0, changePct: 0 },
      lastSeen: null,
      clients: [],
    });

    expect(overview.totals).toEqual({
      events: { current: 4, previous: 3, changePct: (1 / 3) * 100 },
      scores: { current: 3, previous: 1, changePct: 200 },
      projectsByStatus: { new: 0, stopped: 0, active: 1, idle: 1 },
    });
  });
});
