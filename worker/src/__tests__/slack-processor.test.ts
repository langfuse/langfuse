import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import { v4 } from "uuid";
import {
  ActionExecutionStatus,
  JobConfigState,
  PromptDomain,
  SlackActionConfig,
} from "@langfuse/shared";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import { executeWebhook } from "../queues/webhooks";
import type { WebhookInput } from "@langfuse/shared/src/server";

// Mock SlackService
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    SlackService: {
      getInstance: vi.fn(),
    },
    getActionById: vi.fn(),
  };
});

describe("Slack Processor", () => {
  let projectId: string;
  let triggerId: string;
  let actionId: string;
  let automationId: string;
  let promptId: string;
  let executionId: string;
  let mockSlackService: any;

  beforeAll(async () => {
    // Import mocked SlackService
    const server = await import("@langfuse/shared/src/server");
    const { SlackService } = server;

    // getActionById delegates to the real impl so existing tests read real rows
    const actual = await vi.importActual<any>("@langfuse/shared/src/server");
    (server.getActionById as any).mockImplementation(actual.getActionById);

    // Create mock service instance
    mockSlackService = {
      getWebClientForProject: vi.fn(),
      sendMessage: vi.fn(),
    };

    // Setup the getInstance mock to return our mock service
    (SlackService.getInstance as any).mockReturnValue(mockSlackService);

    // Setup default mock implementations
    mockSlackService.getWebClientForProject.mockResolvedValue({
      chat: { postMessage: vi.fn() },
    });

    mockSlackService.sendMessage.mockResolvedValue({
      messageTs: "1234567890.123456",
      channel: "C123456",
    });
  });

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // clearAllMocks wipes call history but preserves the getActionById impl
    const actual = await vi.importActual<any>("@langfuse/shared/src/server");
    const server = await import("@langfuse/shared/src/server");
    (server.getActionById as any).mockImplementation(actual.getActionById);

    // Create test project
    ({ projectId } = await createOrgProjectAndApiKey());

    // Create Slack integration
    await prisma.slackIntegration.create({
      data: {
        projectId,
        teamId: "T123456",
        teamName: "Test Team",
        botToken: encrypt("xoxb-test-token"),
        botUserId: "U123456",
      },
    });

    // Create test prompt
    promptId = v4();
    await prisma.prompt.create({
      data: {
        id: promptId,
        projectId,
        name: "test-prompt",
        version: 1,
        type: "text",
        prompt: { text: "Hello {{name}}" },
        createdBy: "test-user",
      },
    });

    // Create test trigger
    triggerId = v4();
    await prisma.trigger.create({
      data: {
        id: triggerId,
        projectId,
        eventSource: "prompt",
        eventActions: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
      },
    });

    // Create test Slack action
    actionId = v4();
    await prisma.action.create({
      data: {
        id: actionId,
        projectId,
        type: "SLACK",
        config: {
          type: "SLACK",
          channelId: "C123456",
          channelName: "general",
        } as SlackActionConfig,
      },
    });

    // Link trigger to action
    automationId = v4();
    await prisma.automation.create({
      data: {
        id: automationId,
        projectId,
        triggerId,
        actionId,
        name: "Test Slack Automation",
      },
    });

    executionId = v4();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  describe("executeSlack function", () => {
    it("should execute slack action successfully", async () => {
      const { SlackService } = await import("@langfuse/shared/src/server");

      // Get the full prompt for the payload
      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const slackInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          prompt: fullPrompt as PromptDomain,
          action: "created",
          type: "prompt-version",
          user: {
            id: "user-123",
            name: "Test User",
            email: "test@example.com",
          },
        },
      };

      await prisma.automationExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: slackInput.executionId,
          input: slackInput,
        },
      });

      await executeWebhook(slackInput);

      // Verify SlackService was called correctly
      expect(SlackService.getInstance).toHaveBeenCalled();
      expect(mockSlackService.getWebClientForProject).toHaveBeenCalledWith(
        projectId,
      );
      expect(mockSlackService.sendMessage).toHaveBeenCalledWith({
        client: expect.any(Object),
        channelId: "C123456",
        blocks: expect.any(Array),
        text: "Langfuse Notification",
      });

      // Verify database execution record was updated
      const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);
      expect(execution?.output).toMatchObject({
        channel: "C123456",
        messageTs: "1234567890.123456",
      });
      expect(execution?.startedAt).toBeDefined();
      expect(execution?.finishedAt).toBeDefined();
    });

    it("should handle missing automation gracefully", async () => {
      const nonExistentAutomationId = v4();

      const slackInput: WebhookInput = {
        projectId,
        automationId: nonExistentAutomationId,
        executionId,
        payload: {
          prompt: { id: promptId } as PromptDomain,
          action: "created",
          type: "prompt-version",
          user: {
            id: "user-123",
            name: "Test User",
            email: "test@example.com",
          },
        },
      };

      // Should not throw an error, but return gracefully
      await expect(executeWebhook(slackInput)).resolves.toBeUndefined();

      // Verify that no SlackService calls were made
      const { SlackService } = await import("@langfuse/shared/src/server");
      expect(SlackService.getInstance).not.toHaveBeenCalled();
      expect(mockSlackService.getWebClientForProject).not.toHaveBeenCalled();
      expect(mockSlackService.sendMessage).not.toHaveBeenCalled();
    });

    it("should use custom template when provided", async () => {
      const { SlackService } = await import("@langfuse/shared/src/server");

      // Update action to include custom message template
      const customTemplate = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Custom Slack template message",
          },
        },
      ];

      await prisma.action.update({
        where: { id: actionId },
        data: {
          config: {
            type: "SLACK",
            channelId: "C123456",
            channelName: "general",
            messageTemplate: JSON.stringify(customTemplate),
          } as SlackActionConfig,
        },
      });

      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const slackInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          prompt: fullPrompt as any,
          action: "created",
          type: "prompt-version",
          user: {
            id: "user-123",
            name: "Test User",
            email: "test@example.com",
          },
        },
      };

      await prisma.automationExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: executionId,
          input: slackInput,
        },
      });

      await executeWebhook(slackInput);

      // Verify custom template was used
      expect(mockSlackService.sendMessage).toHaveBeenCalledWith({
        client: expect.any(Object),
        channelId: "C123456",
        blocks: customTemplate,
        text: "Langfuse Notification",
      });
    });

    it("should fallback to default message on template error", async () => {
      const { SlackService } = await import("@langfuse/shared/src/server");

      // Update action with invalid JSON template
      await prisma.action.update({
        where: { id: actionId },
        data: {
          config: {
            type: "SLACK",
            channelId: "C123456",
            channelName: "general",
            messageTemplate: "invalid-json-template",
          } as SlackActionConfig,
        },
      });

      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const slackInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          prompt: fullPrompt as PromptDomain,
          action: "created",
          type: "prompt-version",
          user: {
            id: "user-123",
            name: "Test User",
            email: "test@example.com",
          },
        },
      };

      await prisma.automationExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: executionId,
          input: slackInput,
        },
      });

      await executeWebhook(slackInput);

      // Verify default message was used (should have multiple blocks from SlackMessageBuilder)
      expect(mockSlackService.sendMessage).toHaveBeenCalledWith({
        client: expect.any(Object),
        channelId: "C123456",
        blocks: expect.any(Array),
        text: "Langfuse Notification",
      });

      // Verify execution completed successfully despite template error
      const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.COMPLETED);
    });

    it("should disable trigger after 4 consecutive failures", async () => {
      const { SlackService } = await import("@langfuse/shared/src/server");

      // Mock SlackService to throw errors
      mockSlackService.sendMessage.mockRejectedValue(
        new Error("Slack API error"),
      );

      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      // Execute Slack action 5 times to trigger consecutive failures
      for (let i = 0; i < 5; i++) {
        const executionId = v4();

        await prisma.automationExecution.create({
          data: {
            id: executionId,
            projectId,
            triggerId,
            automationId,
            actionId,
            status: ActionExecutionStatus.PENDING,
            sourceId: v4(),
            input: {
              promptName: "test-prompt",
              promptVersion: 1,
              action: "created",
              type: "prompt-version",
            },
          },
        });

        const slackInput: WebhookInput = {
          projectId,
          automationId,
          executionId,
          payload: {
            prompt: fullPrompt as PromptDomain,
            action: "created",
            type: "prompt-version",
            user: {
              id: "user-123",
              name: "Test User",
              email: "test@example.com",
            },
          },
        };

        await executeWebhook(slackInput);

        // Verify execution was marked as error
        const execution = await prisma.automationExecution.findUnique({
          where: { id: executionId },
        });

        expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
        expect(execution?.error).toContain("Slack API error");
      }

      // Verify trigger was disabled after 4 consecutive failures
      const trigger = await prisma.trigger.findUnique({
        where: { id: triggerId },
      });
      expect(trigger?.status).toBe(JobConfigState.INACTIVE);
    });

    it("monitor-alert with a JSON-round-tripped (string) timestamp builds the full message, not the fallback", async () => {
      // Reconfigure the action as a monitor-alert SLACK action.
      await prisma.action.update({
        where: { id: actionId },
        data: {
          config: {
            type: "SLACK",
            channelId: "C123456",
            channelName: "general",
          } as SlackActionConfig,
        },
      });

      const monitorInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          id: executionId,
          timestamp: new Date("2026-05-18T12:01:00.000Z"),
          type: "monitor-alert",
          apiVersion: "v1",
          payload: {
            monitorId: "mon_01",
            projectId,
            severity: "ALERT",
            permalink:
              "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
            message: { title: "High error rate", body: "errors > 100" },
            timestamp: new Date("2026-05-18T12:01:00.000Z"),
            fromTimestamp: new Date("2026-05-18T11:55:30.000Z"),
            toTimestamp: new Date("2026-05-18T12:00:30.000Z"),
            view: "observations",
            filters: [],
            window: "5m",
          },
        },
      };

      // Reproduce the BullMQ wire shape: Dates become ISO strings.
      const wireInput: WebhookInput = JSON.parse(JSON.stringify(monitorInput));

      await executeWebhook(wireInput, { skipValidation: true });

      expect(mockSlackService.sendMessage).toHaveBeenCalledTimes(1);
      const sent = mockSlackService.sendMessage.mock.calls[0][0];
      const blocks = sent.blocks;

      // Full monitor message: header block carries the alert title.
      expect(blocks[0].type).toBe("header");
      expect(blocks[0].text.text).toBe("High error rate");

      // Not the fallback: a single section block starting "*Langfuse Notification*".
      const isFallback =
        blocks.length === 1 &&
        blocks[0].type === "section" &&
        blocks[0].text?.text?.startsWith("*Langfuse Notification*");
      expect(isFallback).toBe(false);
    });

    it("monitor-alert: text fallback is the alert title, not the generic notification", async () => {
      await prisma.action.update({
        where: { id: actionId },
        data: {
          config: {
            type: "SLACK",
            channelId: "C123456",
            channelName: "general",
          } as SlackActionConfig,
        },
      });

      const monitorInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          id: executionId,
          timestamp: new Date("2026-05-18T12:01:00.000Z"),
          type: "monitor-alert",
          apiVersion: "v1",
          payload: {
            monitorId: "mon_01",
            projectId,
            severity: "ALERT",
            permalink:
              "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
            message: { title: "[ALERT] High error rate", body: "errors > 100" },
            timestamp: new Date("2026-05-18T12:01:00.000Z"),
            fromTimestamp: new Date("2026-05-18T11:55:30.000Z"),
            toTimestamp: new Date("2026-05-18T12:00:30.000Z"),
            view: "observations",
            filters: [],
            window: "5m",
          },
        },
      };

      const wireInput: WebhookInput = JSON.parse(JSON.stringify(monitorInput));

      await executeWebhook(wireInput, { skipValidation: true });

      expect(mockSlackService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: "[ALERT] High error rate" }),
      );
    });

    it("should handle SlackService errors gracefully", async () => {
      const { SlackService } = await import("@langfuse/shared/src/server");

      // Mock SlackService to throw an error
      mockSlackService.getWebClientForProject.mockRejectedValue(
        new Error("Failed to get Slack client"),
      );

      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const slackInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          prompt: fullPrompt as PromptDomain,
          action: "created",
          type: "prompt-version",
          user: {
            id: "user-123",
            name: "Test User",
            email: "test@example.com",
          },
        },
      };

      await prisma.automationExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: executionId,
          input: slackInput,
        },
      });

      await executeWebhook(slackInput);

      // Verify execution was marked as error
      const execution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
      });
      expect(execution?.status).toBe(ActionExecutionStatus.ERROR);
      expect(execution?.error).toContain("Failed to get Slack client");
    });

    it("getActionById infra failure propagates for BullMQ retry instead of disabling the trigger", async () => {
      const server = await import("@langfuse/shared/src/server");
      (server.getActionById as any).mockRejectedValueOnce(
        new Error("P2024: connection pool timeout"),
      );

      const fullPrompt = await prisma.prompt.findUnique({
        where: { id: promptId },
      });

      const slackInput: WebhookInput = {
        projectId,
        automationId,
        executionId,
        payload: {
          prompt: fullPrompt as PromptDomain,
          action: "created",
          type: "prompt-version",
          user: {
            id: "user-123",
            name: "Test User",
            email: "test@example.com",
          },
        },
      };

      // Pre-create the execution row so the catch path can fully disable the
      // trigger pre-fix; post-fix the error propagates before the catch.
      await prisma.automationExecution.create({
        data: {
          id: executionId,
          projectId,
          triggerId,
          automationId,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: executionId,
          input: slackInput,
        },
      });

      await expect(executeWebhook(slackInput)).rejects.toThrow();

      const trigger = await prisma.trigger.findUnique({
        where: { id: triggerId },
      });
      expect(trigger?.status).toBe(JobConfigState.ACTIVE);
    });
  });
});
