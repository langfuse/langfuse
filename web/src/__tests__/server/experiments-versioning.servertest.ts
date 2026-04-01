/** @jest-environment node */
// Set environment variables before imports to ensure VERSIONED mode
process.env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION =
  "true";
process.env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION = "true";

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  createDatasetItem,
  getDatasetItems,
  createDatasetItemFilterState,
} from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 } from "uuid";

const __orgIds: string[] = [];

// Helper to add small delays for distinct timestamps
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function prepare() {
  const { project, org } = await createOrgProjectAndApiKey();

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              metadata: {},
            },
          ],
          aiFeaturesEnabled: false,
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: true,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  __orgIds.push(org.id);

  return { project, org, session, ctx, caller };
}

describe("Experiments with Dataset Versioning", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: __orgIds },
      },
    });
  });

  describe("experiments.validateConfig with datasetVersion", () => {
    it("should validate successfully with version that has items", async () => {
      const { project, caller } = await prepare();

      // Create dataset
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId: project.id },
      });

      // Create prompt with variable
      const promptId = v4();
      await prisma.prompt.create({
        data: {
          id: promptId,
          name: v4(),
          version: 1,
          projectId: project.id,
          createdBy: "user-1",
          prompt: "Hello {{name}}",
          type: "text",
        },
      });

      // Create dataset item
      await createDatasetItem({
        projectId: project.id,
        datasetId,
        input: { name: "World" },
        expectedOutput: "Hello World",
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(50);
      const versionWithItems = new Date();

      // Validate with version
      const validation = await caller.experiments.validateConfig({
        projectId: project.id,
        promptId,
        datasetId,
        datasetVersion: versionWithItems,
      });

      expect(validation.isValid).toBe(true);
      expect(validation).toHaveProperty("totalItems");
      if (validation.isValid) {
        expect(validation.totalItems).toBeGreaterThan(0);
      }
    });

    it("should return invalid when version has no items", async () => {
      const { project, caller } = await prepare();

      // Create dataset
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId: project.id },
      });

      // Create prompt with variable
      const promptId = v4();
      await prisma.prompt.create({
        data: {
          id: promptId,
          name: v4(),
          version: 1,
          projectId: project.id,
          createdBy: "user-1",
          prompt: "Hello {{name}}",
          type: "text",
        },
      });

      // Create dataset item AFTER capturing version
      const versionBeforeItems = new Date();
      await delay(50);

      await createDatasetItem({
        projectId: project.id,
        datasetId,
        input: { name: "World" },
        expectedOutput: "Hello World",
        normalizeOpts: {},
        validateOpts: {},
      });

      // Validate with version before items exist
      const validation = await caller.experiments.validateConfig({
        projectId: project.id,
        promptId,
        datasetId,
        datasetVersion: versionBeforeItems,
      });

      expect(validation.isValid).toBe(false);
      expect(validation).toHaveProperty("message");
      if (!validation.isValid) {
        expect(validation.message).toContain("empty");
      }
    });

    it("should work without version (defaults to latest)", async () => {
      const { project, caller } = await prepare();

      // Create dataset
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId: project.id },
      });

      // Create prompt with variable
      const promptId = v4();
      await prisma.prompt.create({
        data: {
          id: promptId,
          name: v4(),
          version: 1,
          projectId: project.id,
          createdBy: "user-1",
          prompt: "Hello {{name}}",
          type: "text",
        },
      });

      // Create dataset item
      await createDatasetItem({
        projectId: project.id,
        datasetId,
        input: { name: "World" },
        expectedOutput: "Hello World",
        normalizeOpts: {},
        validateOpts: {},
      });

      // Validate without version (should use latest)
      const validation = await caller.experiments.validateConfig({
        projectId: project.id,
        promptId,
        datasetId,
        // No datasetVersion provided
      });

      expect(validation.isValid).toBe(true);
      expect(validation).toHaveProperty("totalItems");
      if (validation.isValid) {
        expect(validation.totalItems).toBeGreaterThan(0);
      }
    });
  });

  describe("getDatasetItems temporal query behavior", () => {
    it("should fetch items created after query timestamp", async () => {
      const { project } = await prepare();

      // Create dataset
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId: project.id },
      });

      // Capture time before creation
      const beforeCreation = new Date();
      await delay(50);

      // Create item
      await createDatasetItem({
        projectId: project.id,
        datasetId,
        input: { test: "value1" },
        expectedOutput: "output1",
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(50);
      const afterCreation = new Date();

      // Query before creation should return 0 items
      const itemsBeforeCreation = await getDatasetItems({
        projectId: project.id,
        filterState: createDatasetItemFilterState({
          datasetIds: [datasetId],
          status: "ACTIVE",
        }),
        version: beforeCreation,
      });

      // Query after creation should return 1 item
      const itemsAfterCreation = await getDatasetItems({
        projectId: project.id,
        filterState: createDatasetItemFilterState({
          datasetIds: [datasetId],
          status: "ACTIVE",
        }),
        version: afterCreation,
      });

      expect(itemsBeforeCreation.length).toBe(0);
      expect(itemsAfterCreation.length).toBe(1);
      expect(itemsAfterCreation[0].input).toEqual({ test: "value1" });
    });

    it("should handle multiple items created at different times", async () => {
      const { project } = await prepare();

      // Create dataset
      const datasetId = v4();
      await prisma.dataset.create({
        data: { id: datasetId, name: v4(), projectId: project.id },
      });

      // Create first item
      await createDatasetItem({
        projectId: project.id,
        datasetId,
        input: { item: "first" },
        expectedOutput: "first",
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(50);
      const afterFirstItem = new Date();
      await delay(50);

      // Create second item
      await createDatasetItem({
        projectId: project.id,
        datasetId,
        input: { item: "second" },
        expectedOutput: "second",
        normalizeOpts: {},
        validateOpts: {},
      });

      await delay(50);
      const afterSecondItem = new Date();

      // Query after first item should return 1 item
      const itemsAfterFirst = await getDatasetItems({
        projectId: project.id,
        filterState: createDatasetItemFilterState({
          datasetIds: [datasetId],
          status: "ACTIVE",
        }),
        version: afterFirstItem,
      });

      // Query after second item should return 2 items
      const itemsAfterSecond = await getDatasetItems({
        projectId: project.id,
        filterState: createDatasetItemFilterState({
          datasetIds: [datasetId],
          status: "ACTIVE",
        }),
        version: afterSecondItem,
      });

      expect(itemsAfterFirst.length).toBe(1);
      expect(itemsAfterFirst[0].input).toEqual({ item: "first" });

      expect(itemsAfterSecond.length).toBe(2);
    });
  });
});
