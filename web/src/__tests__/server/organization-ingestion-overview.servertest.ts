import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { randomUUID } from "crypto";
import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@langfuse/shared/src/db";
import { createEvent, createEventsCh } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

async function setupOrganization() {
  const orgId = randomUUID();
  const organization = await prisma.organization.create({
    data: { id: orgId, name: "Ingestion Overview Org" },
  });
  const project = await prisma.project.create({
    data: { id: randomUUID(), orgId, name: `project-${orgId}` },
  });
  const user = await prisma.user.create({
    data: { id: randomUUID(), email: `${orgId}@example.com`, name: "Admin" },
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
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [],
        },
      ],
      featureFlags: testFeatureFlags({ templateFlag: false }),
      admin: true,
    },
    environment: {
      enableExperimentalFeatures: true,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  return {
    orgId,
    project,
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
}

describe("organizationIngestion.overview", () => {
  const testEnv = env as {
    LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES: typeof env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES;
  };
  const originalExperimental = env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES;
  beforeEach(() => {
    testEnv.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES = "true";
  });
  afterEach(() => {
    testEnv.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES = originalExperimental;
  });

  it("returns ingestion rows for the organization's projects", async () => {
    const { orgId, project, caller } = await setupOrganization();
    await createEventsCh([
      createEvent({
        project_id: project.id,
        source: "otel",
        start_time: new Date(Date.now() - 60 * 60 * 1_000),
        ingestion_sdk_name: "python",
        ingestion_sdk_version: "4.1.0",
      }),
      createEvent({
        project_id: project.id,
        source: "API",
        start_time: new Date(Date.now() - 60 * 60 * 1_000),
      }),
    ]);

    const overview = await caller.organizationIngestion.overview({ orgId });

    expect(overview.eventRows).toEqual([
      expect.objectContaining({
        projectId: project.id,
        ingestionPath: "otel",
        sdkName: "python",
        current: 1,
        previous: 0,
      }),
    ]);
  });

  it("returns feature activation counts per project", async () => {
    const { orgId, project, caller } = await setupOrganization();
    const projectId = project.id;

    const evaluationRule = (status: "ACTIVE" | "INACTIVE") => ({
      projectId,
      name: `rule-${randomUUID()}`,
      targetObject: "trace",
      status,
      filter: [],
      sampling: 1,
      delay: 0,
    });
    await prisma.evaluationRule.createMany({
      data: [evaluationRule("ACTIVE"), evaluationRule("INACTIVE")],
    });

    const monitor = (status: "ACTIVE" | "PAUSED") => ({
      projectId,
      name: `monitor-${randomUUID()}`,
      status,
      view: "OBSERVATIONS" as const,
      filters: [],
      metric: {},
      windowMs: 60_000,
      cadenceMs: 60_000,
      thresholdOperator: "GT" as const,
      alertThreshold: 1,
      noData: {},
      renotify: {},
      schedulerBatchId: 0,
    });
    await prisma.monitor.createMany({
      data: [monitor("ACTIVE"), monitor("PAUSED")],
    });

    const [dataset] = await Promise.all(
      ["dataset-a", "dataset-b"].map((name) =>
        prisma.dataset.create({ data: { projectId, name } }),
      ),
    );
    await prisma.datasetItem.createMany({
      data: [
        { id: "current", projectId, datasetId: dataset!.id },
        {
          id: "superseded",
          projectId,
          datasetId: dataset!.id,
          validTo: new Date(),
        },
        { id: "deleted", projectId, datasetId: dataset!.id, isDeleted: true },
      ],
    });

    await prisma.prompt.createMany({
      data: [
        { name: "prompt-a", version: 1 },
        { name: "prompt-a", version: 2 },
        { name: "prompt-b", version: 1 },
      ].map((prompt) => ({
        ...prompt,
        projectId,
        createdBy: "test",
        prompt: "hello",
      })),
    });

    const overview = await caller.organizationIngestion.overview({ orgId });

    expect(overview.projects).toEqual([
      {
        id: projectId,
        name: project.name,
        features: {
          activeEvaluationRules: 1,
          datasets: 2,
          datasetItems: 1,
          activeMonitors: 1,
          prompts: 2,
        },
      },
    ]);
  });
});
