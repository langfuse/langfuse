/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 } from "uuid";
import { ActionExecutionStatus, JobConfigState } from "@langfuse/shared";
import { encrypt, decrypt } from "@langfuse/shared/encryption";
import { generateWebhookSecret } from "@langfuse/shared/encryption";

const __orgIds: string[] = [];

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

describe("automations trpc", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: __orgIds },
      },
    });
  });

  describe("automations.getAutomations", () => {
    it("should retrieve all automations for a project", async () => {
      const { project, caller } = await prepare();

      // Create test prompt
      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "test-prompt",
          version: 1,
          type: "text",
          prompt: { text: "Hello world" },
          createdBy: "test-user",
        },
      });

      // Create test trigger
      const trigger = await prisma.trigger.create({
        data: {
          id: v4(),
          projectId: project.id,
          eventSource: "prompt",
          eventActions: ["created"],
          filter: [],
          status: JobConfigState.ACTIVE,
        },
      });

      // Create test action
      const { secretKey, displaySecretKey } = generateWebhookSecret();
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
            secretKey: encrypt(secretKey),
            displaySecretKey,
          },
        },
      });

      // Link trigger to action
      await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "Test Automation",
        },
      });

      const response = await caller.automations.getAutomations({
        projectId: project.id,
      });

      expect(response).toHaveLength(1);
      expect(response[0]).toMatchObject({
        name: "Test Automation",
        trigger: expect.objectContaining({
          id: trigger.id,
          eventSource: "prompt",
          eventActions: ["created"],
          status: JobConfigState.ACTIVE,
        }),
        action: expect.objectContaining({
          id: action.id,
          type: "WEBHOOK",
          config: expect.objectContaining({
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            displaySecretKey,
          }),
        }),
      });

      expect(response[0].action.config).not.toHaveProperty("secretKey");
    });

    it("should return empty array when no automations exist", async () => {
      const { project, caller } = await prepare();

      const response = await caller.automations.getAutomations({
        projectId: project.id,
      });

      expect(response).toEqual([]);
    });

    it("should return empty array for user with read access but no automations", async () => {
      const { project, session } = await prepare();

      // Create a session with limited permissions (VIEWER can read but not create)
      const limitedSession: Session = {
        ...session,
        user: {
          ...session.user!,
          admin: false,
          organizations: [
            {
              ...session.user!.organizations[0],
              role: "MEMBER",
              projects: [
                {
                  ...session.user!.organizations[0].projects[0],
                  role: "VIEWER", // VIEWER role can read automations but not create/update/delete
                },
              ],
            },
          ],
        },
      };

      const limitedCtx = createInnerTRPCContext({
        session: limitedSession,
        headers: {},
      });
      const limitedCaller = appRouter.createCaller({ ...limitedCtx, prisma });

      const response = await limitedCaller.automations.getAutomations({
        projectId: project.id,
      });

      expect(response).toEqual([]);
    });
  });

  describe("automations.getAutomation", () => {
    it("should retrieve a specific automation", async () => {
      const { project, caller } = await prepare();

      // Create test trigger and action
      const trigger = await prisma.trigger.create({
        data: {
          id: v4(),
          projectId: project.id,
          eventSource: "prompt",
          eventActions: ["created"],
          filter: [],
          status: JobConfigState.ACTIVE,
        },
      });

      const { secretKey, displaySecretKey } = generateWebhookSecret();
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
            secretKey: encrypt(secretKey),
            displaySecretKey,
          },
        },
      });

      const automation = await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "Specific Automation",
        },
      });

      const response = await caller.automations.getAutomation({
        projectId: project.id,
        automationId: automation.id,
      });

      expect(response).toMatchObject({
        name: "Specific Automation",
        trigger: expect.objectContaining({
          id: trigger.id,
        }),
        action: expect.objectContaining({
          id: action.id,
        }),
      });

      // check that the action does not have a secret key in the config
      expect(response.action.config).not.toHaveProperty("secretKey");
      expect(response.action.config).toHaveProperty("displaySecretKey");
      expect(response.action.config.url).toBe("https://example.com/webhook");
      expect(response.action.config.headers).toEqual({
        "Content-Type": "application/json",
      });
      expect(response.action.config.apiVersion).toEqual({ prompt: "v1" });
      expect(response.action.config.type).toBe("WEBHOOK");
      expect(response.action.config.displaySecretKey).toBe(displaySecretKey);
    });

    it("should throw error when automation not found", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.automations.getAutomation({
          projectId: project.id,
          automationId: "non-existent-automation",
        }),
      ).rejects.toThrow(
        `Automation with id non-existent-automation not found.`,
      );
    });
  });

  describe("automations.createAutomation", () => {
    it("should create a new webhook automation", async () => {
      const { project, caller } = await prepare();

      // Create test prompt
      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "test-prompt",
          version: 1,
          type: "text",
          prompt: { text: "Hello world" },
          createdBy: "test-user",
        },
      });

      const response = await caller.automations.createAutomation({
        projectId: project.id,
        name: "New Webhook Automation",
        eventSource: "prompt",
        eventAction: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
        actionType: "WEBHOOK",
        actionConfig: {
          type: "WEBHOOK",
          url: "https://example.com/new-webhook",
          headers: { "Content-Type": "application/json" },
          apiVersion: { prompt: "v1" },
        },
      });

      expect(response.trigger).toMatchObject({
        projectId: project.id,
        eventSource: "prompt",
        eventActions: ["created"],
        status: JobConfigState.ACTIVE,
      });

      expect(response.action).toMatchObject({
        projectId: project.id,
        type: "WEBHOOK",
        config: expect.objectContaining({
          type: "WEBHOOK",
          url: "https://example.com/new-webhook",
        }),
      });

      expect(response.webhookSecret).toBeDefined();
      expect(typeof response.webhookSecret).toBe("string");

      // Verify the automation link was created
      const automation = await prisma.automation.findFirst({
        where: {
          triggerId: response.trigger.id,
          actionId: response.action.id,
        },
      });

      expect(automation).toMatchObject({
        name: "New Webhook Automation",
      });
    });

    it("should throw error when user lacks automations:CUD access", async () => {
      const { project, session } = await prepare();

      // Create a session with limited permissions
      const limitedSession: Session = {
        ...session,
        user: {
          ...session.user!,
          admin: false,
          organizations: [
            {
              ...session.user!.organizations[0],
              role: "MEMBER",
              projects: [
                {
                  ...session.user!.organizations[0].projects[0],
                  role: "VIEWER", // VIEWER role doesn't have automations:CUD scope
                },
              ],
            },
          ],
        },
      };

      const limitedCtx = createInnerTRPCContext({
        session: limitedSession,
        headers: {},
      });
      const limitedCaller = appRouter.createCaller({ ...limitedCtx, prisma });

      await expect(
        limitedCaller.automations.createAutomation({
          projectId: project.id,
          name: "Unauthorized Automation",
          eventSource: "prompt",
          eventAction: ["created"],
          filter: [],
          status: JobConfigState.ACTIVE,
          actionType: "WEBHOOK",
          actionConfig: {
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            headers: {},
            apiVersion: { prompt: "v1" },
          },
        }),
      ).rejects.toThrow("User does not have access to this resource or action");
    });

    it("should validate required fields", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.automations.createAutomation({
          projectId: project.id,
          name: "", // Empty name should fail
          eventSource: "prompt",
          eventAction: ["created"],
          filter: [],
          status: JobConfigState.ACTIVE,
          actionType: "WEBHOOK",
          actionConfig: {
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            headers: {},
            apiVersion: { prompt: "v1" },
          },
        }),
      ).rejects.toThrow("Name is required");
    });
  });

  describe("automations.updateAutomation", () => {
    it("should update an existing automation", async () => {
      const { project, caller } = await prepare();

      // Create initial automation
      const trigger = await prisma.trigger.create({
        data: {
          id: v4(),
          projectId: project.id,
          eventSource: "prompt",
          eventActions: ["created"],
          filter: [],
          status: JobConfigState.ACTIVE,
        },
      });

      const { secretKey, displaySecretKey } = generateWebhookSecret();
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
            secretKey: encrypt(secretKey),
            displaySecretKey,
          },
        },
      });

      const automation = await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "Original Name",
        },
      });

      const response = await caller.automations.updateAutomation({
        projectId: project.id,
        automationId: automation.id,
        name: "Updated Name",
        eventSource: "prompt",
        eventAction: ["created", "updated"],
        filter: [],
        status: JobConfigState.INACTIVE,
        actionType: "WEBHOOK",
        actionConfig: {
          type: "WEBHOOK",
          url: "https://example.com/updated-webhook",
          headers: { "Content-Type": "application/json", "X-Custom": "value" },
          apiVersion: { prompt: "v1" },
        },
      });

      expect(response.trigger).toMatchObject({
        id: trigger.id,
        eventActions: ["created", "updated"],
        status: JobConfigState.INACTIVE,
      });

      expect(response.action.id).toBe(action.id);
      expect(response.action.type).toBe("WEBHOOK");
      expect(response.action.config).toMatchObject({
        type: "WEBHOOK",
        url: "https://example.com/updated-webhook",
        headers: {
          "Content-Type": "application/json",
          "X-Custom": "value",
        },
      });

      // Note: secretKey might be present in update response but shouldn't be in read operations
      // The important test is that it doesn't appear in getAutomations/getAutomation responses

      // Verify the automation name was updated
      const updatedAutomation = await prisma.automation.findFirst({
        where: {
          id: automation.id,
        },
      });

      expect(updatedAutomation?.name).toBe("Updated Name");
    });
  });

  describe("automations.deleteAutomation", () => {
    it("should delete an automation and all related data", async () => {
      const { project, caller } = await prepare();

      // Create automation with executions
      const trigger = await prisma.trigger.create({
        data: {
          id: v4(),
          projectId: project.id,
          eventSource: "prompt",
          eventActions: ["created"],
          filter: [],
          status: JobConfigState.ACTIVE,
        },
      });

      const { secretKey, displaySecretKey } = generateWebhookSecret();
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
            secretKey: encrypt(secretKey),
            displaySecretKey,
          },
        },
      });

      const automation = await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "To Be Deleted",
        },
      });

      // Create some executions
      await prisma.automationExecution.create({
        data: {
          id: v4(),
          automationId: automation.id,
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          status: ActionExecutionStatus.COMPLETED,
          sourceId: v4(),
          input: { test: "data" },
        },
      });

      await prisma.automationExecution.create({
        data: {
          id: v4(),
          automationId: automation.id,
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          status: ActionExecutionStatus.ERROR,
          sourceId: v4(),
          input: { test: "data" },
          error: "Test error",
        },
      });

      // Verify data exists before deletion
      const beforeTrigger = await prisma.trigger.findUnique({
        where: { id: trigger.id },
      });
      const beforeAction = await prisma.action.findUnique({
        where: { id: action.id },
      });
      const beforeExecutions = await prisma.automationExecution.findMany({
        where: { triggerId: trigger.id, actionId: action.id },
      });
      const beforeAutomation = await prisma.automation.findFirst({
        where: { id: automation.id },
      });

      expect(beforeTrigger).not.toBeNull();
      expect(beforeAction).not.toBeNull();
      expect(beforeExecutions).toHaveLength(2);
      expect(beforeAutomation).not.toBeNull();

      // Delete the automation
      await caller.automations.deleteAutomation({
        projectId: project.id,
        automationId: automation.id,
      });

      // Verify all data is deleted
      const afterTrigger = await prisma.trigger.findUnique({
        where: { id: trigger.id },
      });
      const afterAction = await prisma.action.findUnique({
        where: { id: action.id },
      });
      const afterExecutions = await prisma.automationExecution.findMany({
        where: { triggerId: trigger.id, actionId: action.id },
      });
      const afterAutomation = await prisma.automation.findFirst({
        where: { id: automation.id },
      });

      expect(afterTrigger).toBeNull();
      expect(afterAction).toBeNull();
      expect(afterExecutions).toHaveLength(0);
      expect(afterAutomation).toBeNull();
    });
  });

  describe("automations.getAutomationExecutions", () => {
    it("should retrieve execution history with pagination", async () => {
      const { project, caller } = await prepare();

      // Create automation
      const trigger = await prisma.trigger.create({
        data: {
          id: v4(),
          projectId: project.id,
          eventSource: "prompt",
          eventActions: ["created"],
          filter: [],
          status: JobConfigState.ACTIVE,
        },
      });

      const { secretKey, displaySecretKey } = generateWebhookSecret();
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
            secretKey: encrypt(secretKey),
            displaySecretKey,
          },
        },
      });

      const automation = await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "Test Automation",
        },
      });

      // Create multiple executions
      const executions = [];
      for (let i = 0; i < 5; i++) {
        const execution = await prisma.automationExecution.create({
          data: {
            id: v4(),
            automationId: automation.id,
            projectId: project.id,
            triggerId: trigger.id,
            actionId: action.id,
            status:
              i % 2 === 0
                ? ActionExecutionStatus.COMPLETED
                : ActionExecutionStatus.ERROR,
            sourceId: v4(),
            input: { iteration: i },
            output: i % 2 === 0 ? { result: "success" } : undefined,
            error: i % 2 === 1 ? `Error ${i}` : null,
          },
        });
        executions.push(execution);
      }

      const response = await caller.automations.getAutomationExecutions({
        projectId: project.id,
        automationId: automation.id,
        page: 0,
        limit: 3,
      });

      expect(response.executions).toHaveLength(3);
      expect(response.totalCount).toBe(5);
      expect(response.executions[0].createdAt.getTime()).toBeGreaterThanOrEqual(
        response.executions[1].createdAt.getTime(),
      ); // Should be ordered by createdAt desc
    });

    it("should handle pagination correctly", async () => {
      const { project, caller } = await prepare();

      // Create automation
      const trigger = await prisma.trigger.create({
        data: {
          id: v4(),
          projectId: project.id,
          eventSource: "prompt",
          eventActions: ["created"],
          filter: [],
          status: JobConfigState.ACTIVE,
        },
      });

      const { secretKey, displaySecretKey } = generateWebhookSecret();
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
            secretKey: encrypt(secretKey),
            displaySecretKey,
          },
        },
      });

      const automation = await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "Test Automation",
        },
      });

      // Create 10 executions
      for (let i = 0; i < 10; i++) {
        await prisma.automationExecution.create({
          data: {
            id: v4(),
            automationId: automation.id,
            projectId: project.id,
            triggerId: trigger.id,
            actionId: action.id,
            status: ActionExecutionStatus.COMPLETED,
            sourceId: v4(),
            input: { iteration: i },
          },
        });
      }

      // Test first page
      const page1 = await caller.automations.getAutomationExecutions({
        projectId: project.id,
        automationId: automation.id,
        page: 0,
        limit: 5,
      });

      expect(page1.executions).toHaveLength(5);
      expect(page1.totalCount).toBe(10);

      // Test second page
      const page2 = await caller.automations.getAutomationExecutions({
        projectId: project.id,
        automationId: automation.id,
        page: 1,
        limit: 5,
      });

      expect(page2.executions).toHaveLength(5);
      expect(page2.totalCount).toBe(10);

      // Verify different executions
      const page1Ids = page1.executions.map((e) => e.id);
      const page2Ids = page2.executions.map((e) => e.id);
      expect(page1Ids).not.toEqual(page2Ids);
    });
  });

  describe("automations.getCountOfConsecutiveFailures", () => {
    it("should return consecutive failure count", async () => {
      const { project, caller } = await prepare();

      // Create automation
      const trigger = await prisma.trigger.create({
        data: {
          id: v4(),
          projectId: project.id,
          eventSource: "prompt",
          eventActions: ["created"],
          filter: [],
          status: JobConfigState.INACTIVE, // Disabled due to failures
        },
      });

      const { secretKey, displaySecretKey } = generateWebhookSecret();
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
            secretKey: encrypt(secretKey),
            displaySecretKey,
          },
        },
      });

      const automation = await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "Test Automation",
        },
      });

      // Create consecutive failed executions
      for (let i = 0; i < 3; i++) {
        await prisma.automationExecution.create({
          data: {
            id: v4(),
            automationId: automation.id,
            projectId: project.id,
            triggerId: trigger.id,
            actionId: action.id,
            status: ActionExecutionStatus.ERROR,
            sourceId: v4(),
            input: { iteration: i },
            error: `Failure ${i}`,
            createdAt: new Date(Date.now() - (3 - i) * 60000), // Space them out
          },
        });
      }

      const response = await caller.automations.getCountOfConsecutiveFailures({
        projectId: project.id,
        automationId: automation.id,
      });

      expect(response.count).toBe(3);
    });
  });

  describe("automations.regenerateWebhookSecret", () => {
    it("should regenerate webhook secret for existing action", async () => {
      const { project, caller } = await prepare();

      // Create webhook action
      const {
        secretKey: originalSecretKey,
        displaySecretKey: originalDisplaySecretKey,
      } = generateWebhookSecret();
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
            secretKey: encrypt(originalSecretKey),
            displaySecretKey: originalDisplaySecretKey,
          },
        },
      });

      const response = await caller.automations.regenerateWebhookSecret({
        projectId: project.id,
        actionId: action.id,
      });

      expect(response.webhookSecret).toBeDefined();
      expect(response.displaySecretKey).toBeDefined();
      expect(response.webhookSecret).not.toBe(originalSecretKey);
      expect(response.displaySecretKey).not.toBe(originalDisplaySecretKey);
      expect(response.displaySecretKey).toMatch(/^lf-whsec_\.\.\.[a-f0-9]{4}$/);

      // Verify the action was updated in the database
      const updatedAction = await prisma.action.findUnique({
        where: { id: action.id },
      });

      expect(updatedAction?.config).toMatchObject({
        displaySecretKey: response.displaySecretKey,
      });

      // Critical security test: Verify secret is encrypted in database
      const storedSecretKey = (updatedAction?.config as any)?.secretKey;
      expect(storedSecretKey).toBeDefined();
      expect(storedSecretKey).not.toBe(response.webhookSecret); // Should NOT be plain text
      expect(storedSecretKey).not.toBe(originalSecretKey); // Should be different from original

      // Verify that the stored secret can be decrypted to match the returned secret
      const decryptedStoredSecret = decrypt(storedSecretKey);
      expect(decryptedStoredSecret).toBe(response.webhookSecret);
    });

    it("should throw error when action not found", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.automations.regenerateWebhookSecret({
          projectId: project.id,
          actionId: "non-existent-action",
        }),
      ).rejects.toThrow(`Action with id non-existent-action not found.`);
    });

    it("should handle missing webhook action gracefully", async () => {
      const { project, caller } = await prepare();

      // Test with non-existent action ID - this will trigger the validation
      const actionId = v4();
      await expect(
        caller.automations.regenerateWebhookSecret({
          projectId: project.id,
          actionId,
        }),
      ).rejects.toThrow(`Action with id ${actionId} not found.`);
    });

    it("should throw error when user lacks automations:CUD access", async () => {
      const { project, session } = await prepare();

      // Create webhook action
      const { secretKey, displaySecretKey } = generateWebhookSecret();
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
            secretKey: encrypt(secretKey),
            displaySecretKey,
          },
        },
      });

      // Create a session with limited permissions
      const limitedSession: Session = {
        ...session,
        user: {
          ...session.user!,
          admin: false,
          organizations: [
            {
              ...session.user!.organizations[0],
              role: "MEMBER",
              projects: [
                {
                  ...session.user!.organizations[0].projects[0],
                  role: "VIEWER", // VIEWER role doesn't have automations:CUD scope
                },
              ],
            },
          ],
        },
      };

      const limitedCtx = createInnerTRPCContext({
        session: limitedSession,
        headers: {},
      });
      const limitedCaller = appRouter.createCaller({ ...limitedCtx, prisma });

      await expect(
        limitedCaller.automations.regenerateWebhookSecret({
          projectId: project.id,
          actionId: action.id,
        }),
      ).rejects.toThrow("User does not have access to this resource or action");
    });
  });
});
