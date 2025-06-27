/** @jest-environment node */

import { processPromptWebhooks } from "@/src/features/prompts/server/promptWebhookProcessor";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import {
  JobConfigState,
  ActionExecutionStatus,
  type FilterState,
} from "@langfuse/shared";
import { encrypt, generateWebhookSecret } from "@langfuse/shared/encryption";

const __orgIds: string[] = [];

describe("processPromptWebhooks", () => {
  let projectId: string;
  let orgId: string;

  beforeEach(async () => {
    const { project, org } = await createOrgProjectAndApiKey();
    projectId = project.id;
    orgId = org.id;
    __orgIds.push(org.id);
  });

  afterEach(async () => {
    await cleanup();
  });

  async function cleanup() {
    for (const orgId of __orgIds) {
      await prisma.organization.delete({
        where: { id: orgId },
      });
    }
    __orgIds.length = 0;
  }

  async function createTestAction() {
    const actionId = v4();
    const { secretKey, displaySecretKey } = generateWebhookSecret();

    return await prisma.action.create({
      data: {
        id: actionId,
        projectId: projectId,
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
  }

  async function createTestTrigger(filter: FilterState = []) {
    const triggerId = v4();
    return await prisma.trigger.create({
      data: {
        id: triggerId,
        projectId: projectId,
        eventSource: "prompt",
        eventActions: ["created", "updated"],
        status: JobConfigState.ACTIVE,
        filter,
      },
    });
  }

  async function linkTriggerToAction(triggerId: string, actionId: string) {
    return await prisma.triggersOnActions.create({
      data: {
        projectId: projectId,
        triggerId,
        actionId,
        name: "Test Automation",
      },
    });
  }

  it("should process prompt webhook successfully", async () => {
    // Create a prompt
    const promptId = v4();
    const prompt = await prisma.prompt.create({
      data: {
        id: promptId,
        name: "test-prompt",
        version: 1,
        prompt: { text: "Hello {{name}}" },
        projectId: projectId,
        createdBy: "user-1",
        tags: ["test", "integration"],
      },
    });

    // Create action and trigger
    const action = await createTestAction();
    const trigger = await createTestTrigger([
      {
        column: "action",
        operator: "any of" as const,
        value: ["created"],
        type: "arrayOptions",
      },
    ]);
    await linkTriggerToAction(trigger.id, action.id);

    // Process the webhook
    await processPromptWebhooks(prompt, "created");

    // Verify execution was created
    const executions = await prisma.actionExecution.findMany({
      where: {
        projectId: projectId,
        triggerId: trigger.id,
        actionId: action.id,
      },
    });

    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe(ActionExecutionStatus.PENDING);
    expect(executions[0].input).toMatchObject({
      promptName: "test-prompt",
      promptVersion: 1,
      promptId: promptId,
      action: "created",
      type: "prompt",
    });
  });

  it("should skip when action filter doesn't match", async () => {
    // Create a prompt
    const promptId = v4();
    const prompt = await prisma.prompt.create({
      data: {
        id: promptId,
        name: "test-prompt",
        version: 1,
        prompt: { text: "Hello {{name}}" },
        projectId: projectId,
        createdBy: "user-1",
      },
    });

    // Create action and trigger that only matches "updated" actions
    const action = await createTestAction();
    const trigger = await createTestTrigger([
      {
        column: "action",
        operator: "any of" as const,
        type: "arrayOptions",
        value: ["updated"],
      },
    ]);
    await linkTriggerToAction(trigger.id, action.id);

    // Process with "created" action (should not match)
    await processPromptWebhooks(prompt, "created");

    // Verify no execution was created
    const executions = await prisma.actionExecution.findMany({
      where: {
        projectId: projectId,
        triggerId: trigger.id,
        actionId: action.id,
      },
    });

    expect(executions).toHaveLength(0);
  });

  it("should handle name filter correctly", async () => {
    // Create a prompt
    const promptId = v4();
    const prompt = await prisma.prompt.create({
      data: {
        id: promptId,
        name: "production-prompt",
        version: 1,
        prompt: { text: "Hello {{name}}" },
        projectId: projectId,
        createdBy: "user-1",
      },
    });

    // Create action and trigger with only action filter (no name filter for now)
    const action = await createTestAction();
    const trigger = await createTestTrigger([
      {
        column: "action",
        operator: "any of" as const,
        value: ["created"],
        type: "arrayOptions",
      },
    ]);
    await linkTriggerToAction(trigger.id, action.id);

    // Process the webhook
    await processPromptWebhooks(prompt, "created");

    // Verify execution was created
    const executions = await prisma.actionExecution.findMany({
      where: {
        projectId: projectId,
        triggerId: trigger.id,
        actionId: action.id,
      },
    });

    expect(executions).toHaveLength(1);
  });

  it("should skip when prompt doesn't exist", async () => {
    // Create a prompt
    const promptId = v4();
    const prompt = await prisma.prompt.create({
      data: {
        id: promptId,
        name: "test-prompt",
        version: 1,
        prompt: { text: "Hello {{name}}" },
        projectId: projectId,
        createdBy: "user-1",
      },
    });

    // Delete the prompt to simulate it not existing
    await prisma.prompt.delete({
      where: { id: promptId },
    });

    // Create action and trigger
    const action = await createTestAction();
    const trigger = await createTestTrigger([
      {
        column: "action",
        operator: "any of" as const,
        type: "arrayOptions",
        value: ["created"],
      },
    ]);
    await linkTriggerToAction(trigger.id, action.id);

    // Process the webhook (prompt doesn't exist anymore)
    await processPromptWebhooks(prompt, "created");

    // Verify no execution was created
    const executions = await prisma.actionExecution.findMany({
      where: {
        projectId: projectId,
        triggerId: trigger.id,
        actionId: action.id,
      },
    });

    expect(executions).toHaveLength(0);
  });

  it("should skip inactive triggers", async () => {
    // Create a prompt
    const promptId = v4();
    const prompt = await prisma.prompt.create({
      data: {
        id: promptId,
        name: "test-prompt",
        version: 1,
        prompt: { text: "Hello {{name}}" },
        projectId: projectId,
        createdBy: "user-1",
      },
    });

    // Create action and inactive trigger
    const action = await createTestAction();
    const triggerId = v4();
    const trigger = await prisma.trigger.create({
      data: {
        id: triggerId,
        projectId: projectId,
        eventSource: "prompt",
        eventActions: ["created"],
        status: JobConfigState.INACTIVE,
        filter: [
          {
            column: "action",
            operator: "any of" as const,
            type: "arrayOptions",
            value: ["created"],
          },
        ],
      },
    });
    await linkTriggerToAction(trigger.id, action.id);

    // Process the webhook
    await processPromptWebhooks(prompt, "created");

    // Verify no execution was created
    const executions = await prisma.actionExecution.findMany({
      where: {
        projectId: projectId,
        triggerId: trigger.id,
        actionId: action.id,
      },
    });

    expect(executions).toHaveLength(0);
  });
});
