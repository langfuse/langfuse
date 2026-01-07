/** @jest-environment node */

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 } from "uuid";
import {
  ActionExecutionStatus,
  JobConfigState,
  type SafeWebhookActionConfig,
  type WebhookActionConfigWithSecrets,
  isWebhookAction,
} from "@langfuse/shared";
import { encrypt, decrypt } from "@langfuse/shared/encryption";
import { generateWebhookSecret } from "@langfuse/shared/encryption";
import { TRPCError } from "@trpc/server";

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

    it("should not expose secret headers in response", async () => {
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

      // Create test action with secret headers
      const { secretKey, displaySecretKey } = generateWebhookSecret();
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            headers: {
              "content-type": "application/json",
              "x-api-key": encrypt("secret-api-key-123"),
              authorization: encrypt("Bearer secret-token-456"),
            },
            displayHeaders: {
              "content-type": { secret: false, value: "application/json" },
              "x-api-key": { secret: true, value: "secr***123" },
              authorization: { secret: true, value: "Bear***456" },
            },
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
          name: "Secret Headers Automation",
        },
      });

      const response = await caller.automations.getAutomations({
        projectId: project.id,
      });

      expect(response).toHaveLength(1);
      const automationConfig = response[0].action
        .config as SafeWebhookActionConfig;

      // Should have display values, not encrypted values
      expect(automationConfig.displayHeaders).toEqual({
        "content-type": { secret: false, value: "application/json" },
        "x-api-key": { secret: true, value: "secr***123" },
        authorization: { secret: true, value: "Bear***456" },
      });

      // Should NOT have the raw headers with encrypted values
      expect(automationConfig).not.toHaveProperty("headers");
      expect(automationConfig).not.toHaveProperty("decryptedHeaders");
      expect(automationConfig).not.toHaveProperty("requestHeaders");
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
            displayHeaders: {
              "Content-Type": { secret: false, value: "application/json" },
            },
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

      const actionConfig = response.action.config as SafeWebhookActionConfig;

      // check that the action does not have a secret key in the config
      expect(actionConfig).not.toHaveProperty("secretKey");
      expect(actionConfig).toHaveProperty("displaySecretKey");
      expect(actionConfig.url).toBe("https://example.com/webhook");
      expect(actionConfig).not.toHaveProperty("headers");
      expect(actionConfig.displayHeaders).toEqual({
        "Content-Type": { secret: false, value: "application/json" },
      });
      expect(actionConfig.apiVersion).toEqual({ prompt: "v1" });
      expect(actionConfig.type).toBe("WEBHOOK");
      expect(actionConfig.displaySecretKey).toBe(displaySecretKey);
      expect(actionConfig).not.toHaveProperty("headers");
      expect(actionConfig).not.toHaveProperty("decryptedHeaders");
      expect(actionConfig).not.toHaveProperty("requestHeaders");
    });

    it("should not expose secret headers in single automation response", async () => {
      const { project, caller } = await prepare();

      // Create test trigger and action with secret headers
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
            headers: {
              "content-type": "application/json",
              "x-custom": "public-value",
              "x-secret": encrypt("secret-value-789"),
            },
            displayHeaders: {
              "content-type": { secret: false, value: "application/json" },
              "x-custom": { secret: false, value: "public-value" },
              "x-secret": { secret: true, value: "secr***789" },
            },
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
          name: "Mixed Headers Automation",
        },
      });

      const response = await caller.automations.getAutomation({
        projectId: project.id,
        automationId: automation.id,
      });

      const config = response.action.config as SafeWebhookActionConfig;

      // Should have display values
      expect(config.displayHeaders).toEqual({
        "content-type": { secret: false, value: "application/json" },
        "x-custom": { secret: false, value: "public-value" },
        "x-secret": { secret: true, value: "secr***789" },
      });

      // Should NOT have raw encrypted headers
      expect(config).not.toHaveProperty("headers");
    });

    it("should return all legacy header values when reading automation", async () => {
      const { project, caller } = await prepare();

      // Create test trigger and action with legacy headers
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
            // Legacy headers format - plain object with string values
            headers: {
              "content-type": "application/json",
              "x-api-key": "legacy-api-key-value",
            },
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
          name: "Legacy Headers Read Test",
        },
      });

      const response = await caller.automations.getAutomation({
        projectId: project.id,
        automationId: automation.id,
      });

      const config = response.action.config as SafeWebhookActionConfig;

      // Should have display values with all legacy header values returned
      // Legacy headers are converted to the new format with secret: false
      expect(config.displayHeaders).toEqual({
        "content-type": { secret: false, value: "application/json" },
        "x-api-key": { secret: false, value: "legacy-api-key-value" },
      });

      // Should NOT have raw headers object in response
      expect(config).not.toHaveProperty("headers");
      expect(config).not.toHaveProperty("requestHeaders");
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
          requestHeaders: {
            "Content-Type": { secret: false, value: "application/json" },
          },
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

    it("should create automation with both plain and secret headers", async () => {
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
        name: "Mixed Headers Automation",
        eventSource: "prompt",
        eventAction: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
        actionType: "WEBHOOK",
        actionConfig: {
          type: "WEBHOOK",
          url: "https://example.com/mixed-headers",
          requestHeaders: {
            "content-type": { secret: false, value: "application/json" },
            "x-public": { secret: false, value: "public-value" },
            "x-api-key": { secret: true, value: "secret-key-123" },
            authorization: { secret: true, value: "Bearer secret-token-456" },
          },
          apiVersion: { prompt: "v1" },
        },
      });

      // Verify the action was created correctly in the database
      const createdAction = await prisma.action.findUnique({
        where: { id: response.action.id },
      });

      expect(createdAction?.config).toMatchObject({
        type: "WEBHOOK",
        url: "https://example.com/mixed-headers",
      });
      expect(isWebhookAction(createdAction as any)).toBe(true);

      // Headers should be encrypted for secret ones, plain for others
      const config = createdAction?.config as WebhookActionConfigWithSecrets;
      expect(config.requestHeaders["content-type"].value).toBe(
        "application/json",
      );
      expect(config.requestHeaders["x-public"].value).toBe("public-value");
      expect(config.requestHeaders["x-api-key"].secret).toBe(true);
      expect(config.requestHeaders["x-api-key"].value).not.toBe(
        "secret-key-123",
      ); // Should be encrypted
      expect(config.requestHeaders["authorization"].secret).toBe(true);
      expect(config.requestHeaders["authorization"].value).not.toBe(
        "Bearer secret-token-456",
      ); // Should be encrypted

      // Display values should be present
      expect(config.displayHeaders).toMatchObject({
        "content-type": { secret: false, value: "application/json" },
        "x-public": { secret: false, value: "public-value" },
      });
      expect(config.displayHeaders["x-api-key"].value).toBe("secr...-123");
      expect(config.displayHeaders["authorization"].value).toBe("Bear...-456");
    });

    it("should create automation with secret headers that do not expose values in response", async () => {
      const { project, caller } = await prepare();

      const response = await caller.automations.createAutomation({
        projectId: project.id,
        name: "Secret Headers Test",
        eventSource: "prompt",
        eventAction: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
        actionType: "WEBHOOK",
        actionConfig: {
          type: "WEBHOOK",
          url: "https://example.com/webhook",
          requestHeaders: {
            "content-type": { secret: false, value: "application/json" },
            "x-public": { secret: false, value: "public-value" },
            "x-api-key": { secret: true, value: "secret-value-123" },
            authorization: { secret: true, value: "Bearer token-456" },
          },
          apiVersion: { prompt: "v1" },
        },
      });

      const responseConfig = response.action.config as SafeWebhookActionConfig;
      // Response should NOT contain the raw secret values
      expect(responseConfig.displayHeaders).not.toMatchObject({
        "x-api-key": { secret: true, value: "secret-value-123" },
        authorization: { secret: true, value: "Bearer token-456" },
      });

      // Response should contain masked values
      expect(responseConfig.displayHeaders).toMatchObject({
        "content-type": { secret: false, value: "application/json" },
        "x-public": { secret: false, value: "public-value" },
        "x-api-key": { secret: true, value: "secr...-123" },
        authorization: { secret: true, value: "Bear...-456" },
      });

      // Verify secrets fields are not present in response
      expect(responseConfig).not.toHaveProperty("headers");
      expect(responseConfig).not.toHaveProperty("requestHeaders");

      // Check the actual stored data in the database
      const createdAction = await prisma.action.findUnique({
        where: { id: response.action.id },
      });

      const config = createdAction?.config as WebhookActionConfigWithSecrets;
      // Public headers should remain plain
      // Secret headers should be encrypted in storage
      expect(config.requestHeaders).toMatchObject({
        "content-type": { secret: false, value: "application/json" },
        "x-public": { secret: false, value: "public-value" },
      });
      expect(config.requestHeaders["x-api-key"].value).not.toBe(
        "secret-value-123",
      );
      expect(config.requestHeaders["authorization"].value).not.toBe(
        "Bearer token-456",
      );

      // Display values should be present with masked secrets
      expect(config.displayHeaders).toMatchObject({
        "content-type": { secret: false, value: "application/json" },
        "x-public": { secret: false, value: "public-value" },
        "x-api-key": { secret: true, value: "secr...-123" },
        authorization: { secret: true, value: "Bear...-456" },
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
            requestHeaders: {},
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
            requestHeaders: {},
            apiVersion: { prompt: "v1" },
          },
        }),
      ).rejects.toThrow("Name is required");
    });

    it("should create a new Slack automation", async () => {
      const { project, caller } = await prepare();

      // Create Slack integration first
      await prisma.slackIntegration.create({
        data: {
          projectId: project.id,
          teamId: "T123456",
          teamName: "Test Team",
          botToken: encrypt("xoxb-test-token"),
          botUserId: "U123456",
        },
      });

      const response = await caller.automations.createAutomation({
        projectId: project.id,
        name: "New Slack Automation",
        eventSource: "prompt",
        eventAction: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
        actionType: "SLACK",
        actionConfig: {
          type: "SLACK",
          channelId: "C123456",
          channelName: "general",
          messageTemplate: JSON.stringify([
            {
              type: "section",
              text: { type: "mrkdwn", text: "Custom template" },
            },
          ]),
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
        type: "SLACK",
        config: expect.objectContaining({
          type: "SLACK",
          channelId: "C123456",
          channelName: "general",
        }),
      });

      // Ensure no bot token is exposed in response
      expect(JSON.stringify(response)).not.toContain("xoxb-");
    });

    it("should fail to create Slack automation without integration", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.automations.createAutomation({
          projectId: project.id,
          name: "Invalid Slack Automation",
          eventSource: "prompt",
          eventAction: ["created"],
          filter: [],
          status: JobConfigState.ACTIVE,
          actionType: "SLACK",
          actionConfig: {
            type: "SLACK",
            channelId: "C123456",
            channelName: "general",
          },
        }),
      ).rejects.toThrow(
        "Slack integration not found. Please connect your Slack workspace first.",
      );
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
            requestHeaders: {
              "Content-Type": { secret: false, value: "application/json" },
            },
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
          requestHeaders: {
            "Content-Type": { secret: false, value: "application/json" },
            "X-Custom": { secret: false, value: "value" },
          },
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
        displayHeaders: {
          "Content-Type": { secret: false, value: "application/json" },
          "X-Custom": { secret: false, value: "value" },
        },
      });

      // Verify secrets fields are not present in response
      expect(response.action.config).not.toHaveProperty("headers");
      expect(response.action.config).not.toHaveProperty("secretKey");

      // Verify the automation name was updated
      const updatedAutomation = await prisma.automation.findFirst({
        where: {
          id: automation.id,
        },
      });

      expect(updatedAutomation?.name).toBe("Updated Name");
    });

    it("should update automation with both plain and secret headers", async () => {
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
            requestHeaders: {
              "content-type": { secret: false, value: "application/json" },
              "x-old-header": { secret: false, value: "old-value" },
              "x-case-key": { secret: false, value: "some-value" },
            },
            displayHeaders: {
              "content-type": { secret: false, value: "application/json" },
              "x-old-header": { secret: false, value: "old-value" },
              "x-case-key": { secret: false, value: "some-value" },
            },
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
          name: "Headers Update Test",
        },
      });

      const response = await caller.automations.updateAutomation({
        projectId: project.id,
        automationId: automation.id,
        name: "Updated Headers Automation",
        eventSource: "prompt",
        eventAction: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
        actionType: "WEBHOOK",
        actionConfig: {
          type: "WEBHOOK",
          url: "https://example.com/updated-webhook",
          requestHeaders: {
            "content-type": { secret: false, value: "" },
            "x-public": { secret: false, value: "new-public-value" },
            "x-secret-key": { secret: true, value: "new-secret-123" },
            "x-Case-KEY": { secret: false, value: "new-value" },
          },
          apiVersion: { prompt: "v1" },
        },
      });
      const actionConfig = response.action.config as SafeWebhookActionConfig;

      // Verify the API response contains safe display values
      expect(actionConfig.displayHeaders).toMatchObject({
        "content-type": { secret: false, value: "application/json" }, // header preserved
        "x-public": { secret: false, value: "new-public-value" }, // new public header
        "x-secret-key": { secret: true, value: "new-...-123" }, // new secret header
        "x-Case-KEY": { secret: false, value: "new-value" }, // matched existing key, but new value
      });

      expect(actionConfig.displayHeaders).not.toHaveProperty(
        "x-old-header", // header deleted
      );
      expect(actionConfig.displayHeaders).not.toHaveProperty(
        "x-case-key", // new case replaced the old header name
      );

      expect(response.action.config).not.toHaveProperty("headers");
      expect(response.action.config).not.toHaveProperty("secretKey");

      // Verify the action was updated correctly in the database
      const updatedAction = await prisma.action.findUnique({
        where: { id: action.id },
      });

      const config = updatedAction?.config as any;

      // Public headers should remain plain
      expect(config.requestHeaders["content-type"].value).toBe(
        "application/json",
      );
      expect(config.requestHeaders["x-public"].value).toBe("new-public-value");

      // Secret headers should be encrypted
      expect(config.requestHeaders["x-secret-key"].value).not.toBe(
        "new-secret-123",
      );
      expect(config.requestHeaders["x-Case-KEY"].value).toBe("new-value");
      expect(config.requestHeaders["x-case-key"]).toBeUndefined();

      // Display values should be present with masked secrets
      expect(config.displayHeaders).toMatchObject({
        "content-type": { secret: false, value: "application/json" },
        "x-public": { secret: false, value: "new-public-value" },
        "x-secret-key": { secret: true, value: "new-...-123" },
        "x-Case-KEY": { secret: false, value: "new-value" },
      });
      expect(config.displayHeaders).not.toHaveProperty("x-case-key");
    });

    it("should handle switching header types from secret to plain and vice versa", async () => {
      const { project, caller } = await prepare();

      // Create initial automation with mixed headers
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
            requestHeaders: {
              "content-type": { secret: false, value: "application/json" },
              "x-currently-public": { secret: false, value: "public-value" },
              "x-currently-secret": { secret: true, value: "secret-value" },
            },
            displayHeaders: {
              "content-type": { secret: false, value: "application/json" },
              "x-currently-public": { secret: false, value: "public-value" },
              "x-currently-secret": { secret: true, value: "secr...alue" },
            },
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
          name: "Header Type Switch Test",
        },
      });

      // Update: switch the header types
      const response = await caller.automations.updateAutomation({
        projectId: project.id,
        automationId: automation.id,
        name: "Switched Headers Automation",
        eventSource: "prompt",
        eventAction: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
        actionType: "WEBHOOK",
        actionConfig: {
          type: "WEBHOOK",
          url: "https://example.com/updated-webhook",
          requestHeaders: {
            "content-type": { secret: false, value: "application/json" },
            "x-currently-public": { secret: true, value: "now-secret-value" }, // Was public, now secret
            "x-currently-secret": { secret: false, value: "now-public-value" }, // Was secret, now public
          },
          apiVersion: { prompt: "v1" },
        },
      });
      const actionConfig = response.action.config as SafeWebhookActionConfig;

      // Verify the API response contains safe display values reflecting the switch
      expect(actionConfig.displayHeaders).toMatchObject({
        "x-currently-public": { secret: true, value: "now-...alue" },
        "x-currently-secret": { secret: false, value: "now-public-value" },
      });
      expect(response.action.config).not.toHaveProperty("headers");
      expect(response.action.config).not.toHaveProperty("secretKey");

      // Verify the switch worked correctly
      const updatedAction = await prisma.action.findUnique({
        where: { id: action.id },
      });

      const config = updatedAction?.config as WebhookActionConfigWithSecrets;

      // x-currently-public should now be encrypted (was plain, now secret)
      expect(config.requestHeaders["x-currently-public"].value).not.toBe(
        "now-secret-value",
      );

      // x-currently-secret should now be plain (was secret, now public)
      expect(config.requestHeaders["x-currently-secret"].value).toBe(
        "now-public-value",
      );

      // Display values should reflect the changes
      expect(config.displayHeaders).toMatchObject({
        "x-currently-public": { secret: true, value: "now-...alue" },
        "x-currently-secret": { secret: false, value: "now-public-value" },
      });
    });

    it("should fail to flip secret header without providing a value", async () => {
      const { project, caller } = await prepare();

      // Create initial automation with mixed headers
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
            requestHeaders: {
              "x-currently-secret": {
                secret: true,
                value: encrypt("secret-value"),
              },
            },
            displayHeaders: {
              "x-currently-secret": { secret: true, value: "secr...alue" },
            },
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
          name: "Header Type Switch Failed Test",
        },
      });

      // Update: try to switch the header types
      try {
        await caller.automations.updateAutomation({
          projectId: project.id,
          automationId: automation.id,
          name: "Switched Headers Automation",
          eventSource: "prompt",
          eventAction: ["created"],
          filter: [],
          status: JobConfigState.ACTIVE,
          actionType: "WEBHOOK",
          actionConfig: {
            type: "WEBHOOK",
            url: "https://example.com/updated-webhook",
            requestHeaders: {
              "x-currently-secret": { secret: false, value: "" }, // Was secret, now public
            },
            apiVersion: { prompt: "v1" },
          },
        });

        fail("Expected an error to be thrown");
      } catch (error: any) {
        expect(error).toBeInstanceOf(TRPCError);
        expect(error.message).toBe(
          'Header "x-currently-secret" secret status can only be changed when providing a value',
        );
        expect(error.code).toBe("BAD_REQUEST");
      }

      // Verify the switch did not work
      const updatedAction = await prisma.action.findUnique({
        where: { id: action.id },
      });

      const config = updatedAction?.config as WebhookActionConfigWithSecrets;

      // x-currently-secret should still be encrypted
      expect(config.requestHeaders["x-currently-secret"].value).not.toBe(
        "secret-value",
      );

      // Display values should reflect the changes
      expect(config.displayHeaders).toMatchObject({
        "x-currently-secret": { secret: true, value: "secr...alue" },
      });
    });

    it("should allow URL update without requiring secret header values", async () => {
      const { project, caller } = await prepare();

      // Create initial automation with secret headers
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
            requestHeaders: {
              "content-type": { secret: false, value: "application/json" },
              "x-api-key": { secret: true, value: encrypt("secret-key-123") },
              authorization: {
                secret: true,
                value: encrypt("Bearer token-456"),
              },
            },
            displayHeaders: {
              "content-type": { secret: false, value: "application/json" },
              "x-api-key": { secret: true, value: "secr...-123" },
              authorization: { secret: true, value: "Bear...-456" },
            },
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
          name: "URL Update Test",
        },
      });

      // Update only the URL without providing secret header values
      const response = await caller.automations.updateAutomation({
        projectId: project.id,
        automationId: automation.id,
        name: "Updated URL Automation",
        eventSource: "prompt",
        eventAction: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
        actionType: "WEBHOOK",
        actionConfig: {
          type: "WEBHOOK",
          url: "https://example.com/new-webhook-url",
          requestHeaders: {}, // No headers provided
          apiVersion: { prompt: "v1" },
        },
      });
      const actionConfig = response.action.config as SafeWebhookActionConfig;

      // Verify the URL was updated
      expect(actionConfig.url).toBe("https://example.com/new-webhook-url");

      // Verify secret headers were preserved
      expect(actionConfig.displayHeaders).toMatchObject({
        "content-type": { secret: false, value: "application/json" },
        "x-api-key": { secret: true, value: "secr...-123" },
        authorization: { secret: true, value: "Bear...-456" },
      });

      // Verify the action was updated correctly in the database
      const updatedAction = await prisma.action.findUnique({
        where: { id: action.id },
      });

      const config = updatedAction?.config as WebhookActionConfigWithSecrets;

      // URL should be updated
      expect(config.url).toBe("https://example.com/new-webhook-url");

      // Secret headers should still be encrypted and preserved
      expect(config.requestHeaders["x-api-key"].value).not.toBe(
        "secret-key-123",
      );
      expect(config.requestHeaders["authorization"].value).not.toBe(
        "Bearer token-456",
      );

      // Display values should be preserved
      expect(config.displayHeaders).toMatchObject({
        "content-type": { secret: false, value: "application/json" },
        "x-api-key": { secret: true, value: "secr...-123" },
        authorization: { secret: true, value: "Bear...-456" },
      });
    });

    it("should migrate legacy headers to new format on update", async () => {
      const { project, caller } = await prepare();

      // Create initial automation with legacy headers format
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
            // Legacy headers format - plain object with string values
            headers: {
              "content-type": "application/json",
              "x-api-key": "legacy-api-key",
            },
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
          name: "Legacy Headers Migration Test",
        },
      });

      // Update the automation with new headers format, making one secret
      const response = await caller.automations.updateAutomation({
        projectId: project.id,
        automationId: automation.id,
        name: "Migrated Headers Automation",
        eventSource: "prompt",
        eventAction: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
        actionType: "WEBHOOK",
        actionConfig: {
          type: "WEBHOOK",
          url: "https://example.com/updated-webhook",
          requestHeaders: {
            "content-type": { secret: false, value: "application/json" },
            "x-api-key": { secret: true, value: "new-secret-key" },
          },
          apiVersion: { prompt: "v1" },
        },
      });

      const actionConfig = response.action.config as SafeWebhookActionConfig;

      // Verify the API response
      expect(actionConfig.displayHeaders).toMatchObject({
        "content-type": { secret: false, value: "application/json" },
        "x-api-key": { secret: true, value: "new-...-key" },
      });

      // Verify the action was updated correctly in the database
      const updatedAction = await prisma.action.findUnique({
        where: { id: action.id },
      });

      const config = updatedAction?.config as WebhookActionConfigWithSecrets;

      // Legacy headers object should be empty
      expect(config.headers).toEqual({});

      // Secret header should be encrypted in requestHeaders
      expect(config.requestHeaders["x-api-key"].secret).toBe(true);
      expect(config.requestHeaders["x-api-key"].value).not.toBe(
        "new-secret-key",
      );

      // Public header should remain plain
      expect(config.requestHeaders["content-type"].secret).toBe(false);
      expect(config.requestHeaders["content-type"].value).toBe(
        "application/json",
      );

      // Both headers should be in displayHeaders
      expect(config.displayHeaders).toMatchObject({
        "content-type": { secret: false, value: "application/json" },
        "x-api-key": { secret: true, value: "new-...-key" },
      });
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
            requestHeaders: {
              "Content-Type": { secret: false, value: "application/json" },
            },
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
            requestHeaders: {
              "Content-Type": { secret: false, value: "application/json" },
            },
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
            requestHeaders: {
              "Content-Type": { secret: false, value: "application/json" },
            },
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
            requestHeaders: {
              "Content-Type": { secret: false, value: "application/json" },
            },
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

    it("should return 0 consecutive failures when lastFailingExecutionId is set", async () => {
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
            requestHeaders: {
              "Content-Type": { secret: false, value: "application/json" },
            },
            apiVersion: { prompt: "v1" },
            secretKey: encrypt(secretKey),
            displaySecretKey,
            lastFailingExecutionId: "some-failing-execution-id", // This simulates a webhook that was disabled
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

      // Create failed executions that occurred BEFORE the lastFailingExecutionId
      await prisma.automationExecution.create({
        data: {
          id: "some-failing-execution-id",
          automationId: automation.id,
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          status: ActionExecutionStatus.ERROR,
          sourceId: v4(),
          input: { iteration: 0 },
          error: "Old failure",
          createdAt: new Date(Date.now() - 60000), // 1 minute ago
        },
      });

      // Create more failed executions that occurred BEFORE the lastFailingExecutionId
      for (let i = 1; i < 5; i++) {
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
            error: `Old failure ${i}`,
            createdAt: new Date(Date.now() - (60000 + i * 1000)), // Before the lastFailingExecutionId
          },
        });
      }

      const response = await caller.automations.getCountOfConsecutiveFailures({
        projectId: project.id,
        automationId: automation.id,
      });

      // Should return 0 because all failures occurred before the lastFailingExecutionId
      expect(response.count).toBe(0);
    });

    it("should count failures after lastFailingExecutionId correctly", async () => {
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
      const lastFailingExecutionId = v4();
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/webhook",
            requestHeaders: {
              "Content-Type": { secret: false, value: "application/json" },
            },
            apiVersion: { prompt: "v1" },
            secretKey: encrypt(secretKey),
            displaySecretKey,
            lastFailingExecutionId,
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

      // Create the lastFailingExecution
      await prisma.automationExecution.create({
        data: {
          id: lastFailingExecutionId,
          automationId: automation.id,
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          status: ActionExecutionStatus.ERROR,
          sourceId: v4(),
          input: { iteration: 0 },
          error: "Last failing execution",
          createdAt: new Date(Date.now() - 60000), // 1 minute ago
        },
      });

      // Create old failures that should be ignored
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
            error: `Old failure ${i}`,
            createdAt: new Date(Date.now() - (120000 + i * 1000)), // Before the lastFailingExecutionId
          },
        });
      }

      // Create new failures AFTER the lastFailingExecutionId
      for (let i = 0; i < 2; i++) {
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
            error: `New failure ${i}`,
            createdAt: new Date(Date.now() - (30000 - i * 1000)), // After the lastFailingExecutionId
          },
        });
      }

      const response = await caller.automations.getCountOfConsecutiveFailures({
        projectId: project.id,
        automationId: automation.id,
      });

      // Should return 2 because only the 2 new failures after lastFailingExecutionId should be counted
      expect(response.count).toBe(2);
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
            requestHeaders: {
              "Content-Type": { secret: false, value: "application/json" },
            },
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
            requestHeaders: {
              "Content-Type": { secret: false, value: "application/json" },
            },
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

  describe("automations.createAutomation with GITHUB_DISPATCH", () => {
    it("should create a new GitHub dispatch automation", async () => {
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
        name: "New GitHub Dispatch Automation",
        eventSource: "prompt",
        eventAction: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
        actionType: "GITHUB_DISPATCH",
        actionConfig: {
          type: "GITHUB_DISPATCH",
          url: "https://api.github.com/repos/owner/repo/dispatches",
          eventType: "langfuse-prompt-created",
          githubToken: "ghp_test_token_123456",
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
        type: "GITHUB_DISPATCH",
        config: expect.objectContaining({
          type: "GITHUB_DISPATCH",
          url: "https://api.github.com/repos/owner/repo/dispatches",
          eventType: "langfuse-prompt-created",
        }),
      });

      expect(response.webhookSecret).toBeDefined();
      expect(typeof response.webhookSecret).toBe("string");
      expect(response.webhookSecret).toBe("ghp_test_token_123456");

      // Verify the automation link was created
      const automation = await prisma.automation.findFirst({
        where: {
          triggerId: response.trigger.id,
          actionId: response.action.id,
        },
      });

      expect(automation).toMatchObject({
        name: "New GitHub Dispatch Automation",
      });

      // Verify token is encrypted in database
      const createdAction = await prisma.action.findUnique({
        where: { id: response.action.id },
      });

      const config = createdAction?.config as any;
      expect(config.githubToken).toBeDefined();
      expect(config.githubToken).not.toBe("ghp_test_token_123456"); // Should be encrypted
      expect(config.displayGitHubToken).toMatch(/^ghp_...6$/); // Should be masked

      // Verify the response doesn't expose the encrypted token
      const responseConfig = response.action.config as any;
      expect(responseConfig).not.toHaveProperty("githubToken");
      expect(responseConfig.displayGitHubToken).toMatch(/^ghp_...6$/);
    });

    it("should fail to create GitHub dispatch automation with invalid URL", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.automations.createAutomation({
          projectId: project.id,
          name: "Invalid GitHub URL",
          eventSource: "prompt",
          eventAction: ["created"],
          filter: [],
          status: JobConfigState.ACTIVE,
          actionType: "GITHUB_DISPATCH",
          actionConfig: {
            type: "GITHUB_DISPATCH",
            url: "https://example.com/not-github",
            eventType: "test-event",
            githubToken: "ghp_token_123",
          },
        }),
      ).rejects.toThrow();
    });

    it("should fail to create GitHub dispatch automation without token", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.automations.createAutomation({
          projectId: project.id,
          name: "No GitHub Token",
          eventSource: "prompt",
          eventAction: ["created"],
          filter: [],
          status: JobConfigState.ACTIVE,
          actionType: "GITHUB_DISPATCH",
          actionConfig: {
            type: "GITHUB_DISPATCH",
            url: "https://api.github.com/repos/owner/repo/dispatches",
            githubToken: "",
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe("automations.updateAutomation with GITHUB_DISPATCH", () => {
    it("should update GitHub dispatch automation URL without requiring token", async () => {
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

      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "GITHUB_DISPATCH",
          config: {
            type: "GITHUB_DISPATCH",
            url: "https://api.github.com/repos/owner/repo/dispatches",
            eventType: "old-event",
            githubToken: encrypt("ghp_old_token"),
            displayGitHubToken: "ghp_...ken",
          },
        },
      });

      const automation = await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "Original GitHub Dispatch",
        },
      });

      // Update URL and event type without providing new token
      const response = await caller.automations.updateAutomation({
        projectId: project.id,
        automationId: automation.id,
        name: "Updated GitHub Dispatch",
        eventSource: "prompt",
        eventAction: ["created", "updated"],
        filter: [],
        status: JobConfigState.ACTIVE,
        actionType: "GITHUB_DISPATCH",
        actionConfig: {
          type: "GITHUB_DISPATCH",
          url: "https://api.github.com/repos/owner/new-repo/dispatches",
          eventType: "new-event",
          githubToken: "", // Empty token means keep existing
        },
      });

      expect(response.action.id).toBe(action.id);
      expect(response.action.type).toBe("GITHUB_DISPATCH");

      const config = response.action.config as any;
      expect(config.url).toBe(
        "https://api.github.com/repos/owner/new-repo/dispatches",
      );
      expect(config.eventType).toBe("new-event");
      expect(config.displayGitHubToken).toBe("ghp_...ken"); // Preserved

      // Verify secrets not exposed in response
      expect(config).not.toHaveProperty("githubToken");

      // Verify the automation name was updated
      const updatedAutomation = await prisma.automation.findFirst({
        where: { id: automation.id },
      });
      expect(updatedAutomation?.name).toBe("Updated GitHub Dispatch");
    });

    it("should update GitHub dispatch automation with new token", async () => {
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

      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "GITHUB_DISPATCH",
          config: {
            type: "GITHUB_DISPATCH",
            url: "https://api.github.com/repos/owner/repo/dispatches",
            eventType: "test-event-type",
            githubToken: encrypt("ghp_old_token_123"),
            displayGitHubToken: "ghp_...123",
          },
        },
      });

      const automation = await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "GitHub Dispatch Token Update",
        },
      });

      // Update with new token
      const response = await caller.automations.updateAutomation({
        projectId: project.id,
        automationId: automation.id,
        name: "GitHub Dispatch Token Update",
        eventSource: "prompt",
        eventAction: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
        actionType: "GITHUB_DISPATCH",
        actionConfig: {
          type: "GITHUB_DISPATCH",
          url: "https://api.github.com/repos/owner/repo/dispatches",
          githubToken: "ghp_new_token_456",
        },
      });

      // Verify token is NOT returned (users provided it themselves)
      expect(response.webhookSecret).toBeUndefined();

      const config = response.action.config as any;
      expect(config.displayGitHubToken).toMatch(/^ghp_...6$/);
      expect(config).not.toHaveProperty("githubToken");

      // Verify token is encrypted in database
      const updatedAction = await prisma.action.findUnique({
        where: { id: action.id },
      });

      const dbConfig = updatedAction?.config as any;
      expect(dbConfig.githubToken).not.toBe("ghp_new_token_456"); // Encrypted
      expect(decrypt(dbConfig.githubToken)).toBe("ghp_new_token_456"); // Can decrypt
    });

    it("should preserve encrypted token when updating without providing new token", async () => {
      const { project, caller } = await prepare();

      const originalToken = "ghp_original_token_xyz";
      const encryptedToken = encrypt(originalToken);

      // Create initial automation with encrypted token
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

      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "GITHUB_DISPATCH",
          config: {
            type: "GITHUB_DISPATCH",
            url: "https://api.github.com/repos/owner/repo/dispatches",
            eventType: "original-event-type",
            githubToken: encryptedToken,
            displayGitHubToken: "ghp_...xyz",
          },
        },
      });

      const automation = await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "GitHub Dispatch Preserve Token",
        },
      });

      // Update URL without providing token
      await caller.automations.updateAutomation({
        projectId: project.id,
        automationId: automation.id,
        name: "GitHub Dispatch Preserve Token",
        eventSource: "prompt",
        eventAction: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
        actionType: "GITHUB_DISPATCH",
        actionConfig: {
          type: "GITHUB_DISPATCH",
          url: "https://api.github.com/repos/new-owner/new-repo/dispatches",
          eventType: "new-event-type",
          // githubToken intentionally omitted
        },
      });

      // Verify token was preserved (not double-encrypted)
      const updatedAction = await prisma.action.findUnique({
        where: { id: action.id },
      });

      const dbConfig = updatedAction?.config as any;

      // Token should still be the same encrypted value
      expect(dbConfig.githubToken).toBe(encryptedToken);

      // Should still decrypt to original plaintext
      expect(decrypt(dbConfig.githubToken)).toBe(originalToken);

      // Verify URL and eventType were updated
      expect(dbConfig.url).toBe(
        "https://api.github.com/repos/new-owner/new-repo/dispatches",
      );
      expect(dbConfig.eventType).toBe("new-event-type");
    });
  });
});
