import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { v4 } from "uuid";
import {
  ActionExecutionStatus,
  JobConfigState,
  TriggerEventSource,
  TriggerEventAction,
  PromptType,
} from "@langfuse/shared";
import {
  createOrgProjectAndApiKey,
  redis,
  EntityChangeEventType,
} from "@langfuse/shared/src/server";
import { ActionType, prisma } from "@langfuse/shared/src/db";
import { promptVersionProcessor } from "../features/entityChange/promptVersionProcessor";

describe("promptVersionChangeWorker", () => {
  let orgId: string;
  let projectId: string;
  let auth: string;

  beforeEach(async () => {
    // Create test organization and project
    const result = await createOrgProjectAndApiKey();
    orgId = result.orgId;
    projectId = result.projectId;
    auth = result.auth;
  });

  describe("successful trigger execution", () => {
    it("should execute webhook for matching prompt created event", async () => {
      // Create a prompt
      const promptId = v4();

      // Create a webhook action
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

      // Create a trigger that matches prompt created events
      const triggerId = v4();
      await prisma.trigger.create({
        data: {
          id: triggerId,
          projectId,
          eventSource: TriggerEventSource.Prompt,
          status: JobConfigState.ACTIVE,
          filter: [
            {
              column: "action",
              operator: "=",
              value: "created",
              type: "string",
            },
          ],
        },
      });

      // Create automation linking trigger and action
      const automationId = v4();
      await prisma.automation.create({
        data: {
          id: automationId,
          name: "prompt-created-automation",
          projectId,
          triggerId,
          actionId,
        },
      });

      // Create the event to process
      const event: EntityChangeEventType = {
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
      };

      // Execute the worker
      await promptVersionProcessor(event);

      // Verify automation execution was created
      const executions = await prisma.automationExecution.findMany({
        where: {
          projectId,
          automationId,
          triggerId,
          actionId,
        },
      });

      expect(executions).toHaveLength(1);
      expect(executions[0].status).toBe(ActionExecutionStatus.PENDING);
      expect(executions[0].sourceId).toBe(promptId);
    });

    it("should execute webhook for matching prompt updated event", async () => {
      // Create a prompt
      const promptId = v4();

      // Create a webhook action
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

      // Create a trigger that matches prompt updated events
      const triggerId = v4();
      await prisma.trigger.create({
        data: {
          id: triggerId,
          projectId,
          eventSource: TriggerEventSource.Prompt,
          status: JobConfigState.ACTIVE,
          filter: [
            {
              column: "action",
              operator: "=",
              value: "updated",
              type: "string",
            },
          ],
        },
      });

      // Create automation linking trigger and action
      const automationId = v4();
      await prisma.automation.create({
        data: {
          id: automationId,
          name: "prompt-updated-automation",
          projectId,
          triggerId,
          actionId,
        },
      });

      // Create the event to process
      const event: EntityChangeEventType = {
        entityType: "prompt-version",
        projectId,
        promptId,
        action: "updated",
        prompt: {
          id: promptId,
          projectId,
          name: "test-prompt",
          version: 2,
          prompt: { messages: [{ role: "user", content: "Hello updated" }] },
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
      };

      // Execute the worker
      await promptVersionProcessor(event);

      // Verify automation execution was created
      const executions = await prisma.automationExecution.findMany({
        where: {
          projectId,
          automationId,
          triggerId,
          actionId,
        },
      });

      expect(executions).toHaveLength(1);
      expect(executions[0].status).toBe(ActionExecutionStatus.PENDING);
    });
  });

  it("should not execute when action filter doesn't match", async () => {
    // Create a prompt
    const promptId = v4();

    // Create a webhook action
    const actionId = v4();
    await prisma.action.create({
      data: {
        id: actionId,
        projectId,
        type: ActionType.WEBHOOK,
        config: {
          url: "https://webhook.example.com/test",
          headers: {},
          method: "POST",
        },
      },
    });

    // Create a trigger that only matches DELETED events
    const triggerId = v4();
    await prisma.trigger.create({
      data: {
        id: triggerId,
        projectId,
        eventSource: TriggerEventSource.Prompt,
        status: JobConfigState.ACTIVE,
        filter: [
          {
            column: "action",
            operator: "=",
            value: "deleted",
            type: "string",
          },
        ],
      },
    });

    // Create automation linking trigger and action
    const automationId = v4();
    await prisma.automation.create({
      data: {
        id: automationId,
        name: "prompt-deleted-automation",
        projectId,
        triggerId,
        actionId,
      },
    });

    // Create a CREATED event (which shouldn't match the DELETED filter)
    const event: EntityChangeEventType = {
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
    };

    // Execute the worker
    await promptVersionProcessor(event);

    // Verify no automation execution was created
    const executions = await prisma.automationExecution.findMany({
      where: {
        projectId,
        automationId,
      },
    });

    expect(executions).toHaveLength(0);
  });

  it("should not execute when prompt name filter doesn't match", async () => {
    // Create a prompt
    const promptId = v4();

    // Create a webhook action
    const actionId = v4();
    await prisma.action.create({
      data: {
        id: actionId,
        projectId,
        type: ActionType.WEBHOOK,
        config: {
          url: "https://webhook.example.com/test",
          headers: {},
          method: "POST",
        },
      },
    });

    // Create a trigger that matches CREATED events but only for specific prompt name
    const triggerId = v4();
    await prisma.trigger.create({
      data: {
        id: triggerId,
        projectId,
        eventSource: TriggerEventSource.Prompt,
        status: JobConfigState.ACTIVE,
        filter: [
          {
            column: "action",
            operator: "=",
            value: "created",
            type: "string",
          },
          {
            column: "name",
            operator: "=",
            value: "target-prompt",
            type: "string",
          },
        ],
      },
    });

    // Create automation linking trigger and action
    const automationId = v4();
    await prisma.automation.create({
      data: {
        id: automationId,
        name: "specific-prompt-automation",
        projectId,
        triggerId,
        actionId,
      },
    });

    // Create event with different prompt name
    const event: EntityChangeEventType = {
      entityType: "prompt-version",
      projectId,
      promptId,
      action: "created",
      prompt: {
        id: promptId,
        projectId,
        name: "different-prompt",
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
    };

    // Execute the worker
    await promptVersionProcessor(event);

    // Verify no automation execution was created
    const executions = await prisma.automationExecution.findMany({
      where: {
        projectId,
        automationId,
      },
    });

    expect(executions).toHaveLength(0);
  });

  it("should not execute webhook when event action is not in trigger eventActions", async () => {
    // Create a prompt
    const promptId = v4();

    // Create a webhook action
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
          apiVersion: { prompt: "v1" },
          secretKey: "test-secret",
          displaySecretKey: "test-***",
        },
      },
    });

    // Create a trigger that only allows "created" and "deleted" actions (NOT "updated")
    const triggerId = v4();
    await prisma.trigger.create({
      data: {
        id: triggerId,
        projectId,
        eventSource: TriggerEventSource.Prompt,
        eventActions: ["created", "deleted"] as TriggerEventAction[],
        status: JobConfigState.ACTIVE,
        filter: [], // Empty filter means no additional filtering
      },
    });

    // Create automation linking trigger and action
    const automationId = v4();
    await prisma.automation.create({
      data: {
        id: automationId,
        name: "prompt-created-deleted-only",
        projectId,
        triggerId,
        actionId,
      },
    });

    // Create an "updated" event (which should NOT trigger the webhook)
    const updatedEvent: EntityChangeEventType = {
      entityType: "prompt-version",
      projectId,
      promptId,
      action: "updated",
      prompt: {
        id: promptId,
        projectId,
        name: "test-prompt",
        version: 2,
        prompt: { messages: [{ role: "user", content: "Hello updated" }] },
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
    };

    // Execute the worker with "updated" event
    await promptVersionProcessor(updatedEvent);

    // Verify NO automation execution was created for "updated" event
    let executions = await prisma.automationExecution.findMany({
      where: {
        projectId,
        automationId,
      },
    });

    expect(executions).toHaveLength(0);

    // Now create a "created" event (which SHOULD trigger the webhook)
    const createdEvent: EntityChangeEventType = {
      entityType: "prompt-version",
      projectId,
      promptId: v4(),
      action: "created",
      prompt: {
        id: v4(),
        projectId,
        name: "test-prompt",
        version: 3,
        prompt: { messages: [{ role: "user", content: "Hello created" }] },
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
    };

    // Execute the worker with "created" event
    await promptVersionProcessor(createdEvent);

    // Verify automation execution WAS created for "created" event
    executions = await prisma.automationExecution.findMany({
      where: {
        projectId,
        automationId,
      },
    });

    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe(ActionExecutionStatus.PENDING);
  });
});
