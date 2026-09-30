import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { randomUUID } from "crypto";
import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
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

async function setupOrganization({ admin = false }: { admin?: boolean } = {}) {
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
      admin,
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
  const testEnv = env as {
    LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES: typeof env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES;
  };
  const originalExperimental = env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES;
  beforeEach(() => {
    testEnv.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES = "false";
  });
  afterEach(() => {
    testEnv.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES = originalExperimental;
  });

  it("rejects callers without internal access", async () => {
    const { orgId, caller } = await setupOrganization();

    await expect(
      caller.organizationIngestion.overview({ orgId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets platform admins see every project in the organization", async () => {
    const { orgId, busyProject, idleProject, inaccessibleProject, caller } =
      await setupOrganization({ admin: true });

    const overview = await caller.organizationIngestion.overview({ orgId });

    expect(overview.projects.map((project) => project.id).sort()).toEqual(
      [busyProject.id, idleProject.id, inaccessibleProject.id].sort(),
    );
  });

  it("returns per-project event and score rows per client with week-over-week counts", async () => {
    testEnv.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES = "true";
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

    expect(overview.projects.map((project) => project.id).sort()).toEqual(
      [busyProject.id, idleProject.id].sort(),
    );
    expect(
      new Date(overview.window.to).getTime() -
        new Date(overview.window.currentFrom).getTime(),
    ).toBe(7 * DAY_MS);
    expect(
      new Date(overview.window.currentFrom).getTime() -
        new Date(overview.window.previousFrom).getTime(),
    ).toBe(7 * DAY_MS);

    expect(overview.eventRows).toHaveLength(3);
    expect(overview.eventRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId: busyProject.id,
          ingestionPath: "otel",
          sdkName: "python",
          sdkVersion: "4.1.0",
          canonicalSdkName: "python",
          sdkUpgradeStatus: "current",
          publicKey: "pk-lf-python",
          isInternal: false,
          current: 3,
          previous: 1,
        }),
        expect.objectContaining({
          projectId: busyProject.id,
          ingestionPath: "otel",
          sdkName: null,
          sdkVersion: null,
          canonicalSdkName: null,
          sdkUpgradeStatus: "unknown",
          publicKey: "pk-lf-custom",
          isInternal: false,
          current: 0,
          previous: 2,
        }),
        expect.objectContaining({
          projectId: busyProject.id,
          ingestionPath: "ingestion_api",
          isInternal: true,
          current: 1,
          previous: 0,
        }),
      ]),
    );

    expect(overview.scoreRows).toHaveLength(3);
    expect(overview.scoreRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId: busyProject.id,
          source: "API",
          sdkName: "python",
          publicKey: "pk-lf-python",
          current: 2,
          previous: 0,
        }),
        expect.objectContaining({
          projectId: busyProject.id,
          source: "EVAL",
          current: 1,
          previous: 0,
        }),
        expect.objectContaining({
          projectId: busyProject.id,
          source: "ANNOTATION",
          current: 0,
          previous: 1,
        }),
      ]),
    );
  });
});
