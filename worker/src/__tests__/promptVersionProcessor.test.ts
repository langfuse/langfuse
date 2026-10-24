import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { v4 } from "uuid";
import {
  ActionExecutionStatus,
  JobConfigState,
  TriggerEventSource,
  PromptType,
} from "@langfuse/shared";
import {
  createOrgProjectAndApiKey,
  EntityChangeEventType,
  WebhookQueue,
} from "@langfuse/shared/src/server";
import { ActionType, prisma } from "@langfuse/shared/src/db";
import { promptVersionProcessor } from "../features/entityChange/promptVersionProcessor";

describe("promptVersionChangeWorker", () => {
  let projectId: string;

  beforeEach(async () => {
    const result = await createOrgProjectAndApiKey();
    projectId = result.projectId;
  });

  it.each([
    // eventActions only
    {
      description: "should execute webhook for matching prompt created event",
      trigger: { eventActions: ["created"], nameFilter: null },
      event: { promptName: "test-prompt", action: "created" as const },
      expected: 1,
    },
    {
      description: "should execute webhook for matching prompt updated event",
      trigger: { eventActions: ["updated"], nameFilter: null },
      event: { promptName: "test-prompt", action: "updated" as const },
      expected: 1,
    },
    {
      description: "should execute webhook for matching prompt deleted event",
      trigger: { eventActions: ["deleted"], nameFilter: null },
      event: { promptName: "test-prompt", action: "deleted" as const },
      expected: 1,
    },
    {
      description: "should not execute when action filter doesn't match",
      trigger: { eventActions: ["deleted"], nameFilter: null },
      event: { promptName: "test-prompt", action: "created" as const },
      expected: 0,
    },
    {
      description:
        "should execute webhook when eventActions and filters are empty",
      trigger: { eventActions: [] as string[], nameFilter: null },
      event: { promptName: "test-prompt", action: "updated" as const },
      expected: 1,
    },
    // eventActions + name filter combinations
    {
      description:
        "should execute webhook when eventActions is empty and name filter matches",
      trigger: { eventActions: [] as string[], nameFilter: "target-prompt" },
      event: { promptName: "target-prompt", action: "created" as const },
      expected: 1,
    },
    {
      description:
        "should execute webhook when eventActions and name filter both match",
      trigger: { eventActions: ["created"], nameFilter: "target-prompt" },
      event: { promptName: "target-prompt", action: "created" as const },
      expected: 1,
    },
    {
      description:
        "should not execute when eventActions matches but name filter does not",
      trigger: { eventActions: ["created"], nameFilter: "target-prompt" },
      event: { promptName: "different-prompt", action: "created" as const },
      expected: 0,
    },
    {
      description:
        "should not execute when eventActions does not match but name filter does",
      trigger: { eventActions: ["deleted"], nameFilter: "target-prompt" },
      event: { promptName: "target-prompt", action: "created" as const },
      expected: 0,
    },
  ])(
    "$description",
    async ({ trigger, event: { promptName, action }, expected }) => {
      const { eventActions, nameFilter } = trigger;
      const promptId = v4();

      const actionId = v4();
      await prisma.action.create({
        data: {
          id: actionId,
          projectId,
          type: ActionType.WEBHOOK,
          config: {
            type: "WEBHOOK",
            url: "https://webhook.example.com/test",
            headers: {},
            method: "POST",
          },
        },
      });

      const triggerId = v4();
      await prisma.trigger.create({
        data: {
          id: triggerId,
          projectId,
          eventSource: TriggerEventSource.Prompt,
          eventActions,
          status: JobConfigState.ACTIVE,
          filter: nameFilter
            ? [
                {
                  column: "Name",
                  operator: "=",
                  value: nameFilter,
                  type: "string",
                },
              ]
            : [],
        },
      });

      const automationId = v4();
      await prisma.automation.create({
        data: {
          id: automationId,
          name: `automation-${v4()}`,
          projectId,
          triggerId,
          actionId,
        },
      });

      const event: EntityChangeEventType = {
        entityType: "prompt-version",
        projectId,
        promptId,
        action,
        prompt: {
          id: promptId,
          projectId,
          name: promptName,
          version: 1,
          prompt: { messages: [{ role: "user", content: "Hello" }] },
          config: null,
          tags: [],
          labels: [],
          type: PromptType.Chat,
          isActive: true,
          createdBy: "test-user",
          createdAt: new Date(),
          updatedAt: new Date(),
          commitMessage: null,
        },
        user: {
          id: "test-user",
          name: "Test User",
          email: "test@example.com",
        },
      };

      await promptVersionProcessor(event);

      const executions = await prisma.automationExecution.findMany({
        where: { projectId, automationId },
      });

      expect(executions).toHaveLength(expected);
      if (expected > 0) {
        expect(executions[0].status).toBe(ActionExecutionStatus.PENDING);
        expect(executions[0].sourceId).toBe(promptId);
      }
    },
  );

  describe("when the webhook job cannot be enqueued", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const createWebhookAutomation = async (projectId: string) => {
      const actionId = v4();
      await prisma.action.create({
        data: {
          id: actionId,
          projectId,
          type: ActionType.WEBHOOK,
          config: {
            type: "WEBHOOK",
            url: "https://webhook.example.com/test",
            headers: {},
            method: "POST",
          },
        },
      });

      const triggerId = v4();
      await prisma.trigger.create({
        data: {
          id: triggerId,
          projectId,
          eventSource: TriggerEventSource.Prompt,
          eventActions: [],
          status: JobConfigState.ACTIVE,
          filter: [],
        },
      });

      const automationId = v4();
      await prisma.automation.create({
        data: {
          id: automationId,
          name: `automation-${v4()}`,
          projectId,
          triggerId,
          actionId,
        },
      });

      return automationId;
    };

    const buildPromptCreatedEvent = (
      projectId: string,
      promptId: string,
    ): EntityChangeEventType => ({
      entityType: "prompt-version",
      projectId,
      promptId,
      action: "created",
      prompt: {
        id: promptId,
        projectId,
        name: "test-prompt",
        version: 1,
        prompt: { messages: [{ role: "user", content: "Hello" }] },
        config: null,
        tags: [],
        labels: [],
        type: PromptType.Chat,
        isActive: true,
        createdBy: "test-user",
        createdAt: new Date(),
        updatedAt: new Date(),
        commitMessage: null,
      },
      user: {
        id: "test-user",
        name: "Test User",
        email: "test@example.com",
      },
    });

    it("should mark the execution as errored when the queue rejects the job", async () => {
      const automationId = await createWebhookAutomation(projectId);
      const promptId = v4();
      vi.spyOn(WebhookQueue, "getInstance").mockReturnValue({
        add: vi.fn(async () => {
          throw new Error("redis unavailable");
        }),
      } as unknown as Exclude<
        ReturnType<typeof WebhookQueue.getInstance>,
        null
      >);

      await promptVersionProcessor(
        buildPromptCreatedEvent(projectId, promptId),
      );

      const executions = await prisma.automationExecution.findMany({
        where: { projectId, automationId },
      });

      expect(executions).toHaveLength(1);
      expect(executions[0].status).toBe(ActionExecutionStatus.ERROR);
      expect(executions[0].error).toContain("redis unavailable");
      expect(executions[0].finishedAt).not.toBeNull();
    });

    it("should mark the execution as errored when the webhook queue is not initialized", async () => {
      const automationId = await createWebhookAutomation(projectId);
      const promptId = v4();
      vi.spyOn(WebhookQueue, "getInstance").mockReturnValue(null);

      await promptVersionProcessor(
        buildPromptCreatedEvent(projectId, promptId),
      );

      const executions = await prisma.automationExecution.findMany({
        where: { projectId, automationId },
      });

      expect(executions).toHaveLength(1);
      expect(executions[0].status).toBe(ActionExecutionStatus.ERROR);
      expect(executions[0].error).toContain("not initialized");
      expect(executions[0].finishedAt).not.toBeNull();
    });
  });
});
