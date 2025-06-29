import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v4 } from "uuid";
import {
  promptVersionChangeProcessor,
  QueueJobs,
  QueueName,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { JobConfigState, ActionExecutionStatus } from "@langfuse/shared";
import { encrypt, generateWebhookSecret } from "@langfuse/shared/encryption";

const __orgIds: string[] = [];

describe("promptVersionChangeProcessor", () => {
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

  it("should process prompt version change event successfully", async () => {
    // Create a prompt
    const promptId = v4();
    await prisma.prompt.create({
      data: {
        id: promptId,
        name: "test-prompt",
        version: 1,
        prompt: { text: "Hello {{name}}" },
        projectId: projectId,
        createdBy: "user-1",
      },
    });

    // Create a webhook action
    const actionId = v4();
    const { secretKey, displaySecretKey } = generateWebhookSecret();

    const action = await prisma.action.create({
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

    // Create a trigger
    const triggerId = v4();
    const trigger = await prisma.trigger.create({
      data: {
        id: triggerId,
        projectId: projectId,
        eventSource: "prompt",
        eventActions: ["created"],
        status: JobConfigState.ACTIVE,
        filter: [
          {
            column: "action",
            operator: "any of" as const,
            value: ["created"],
            type: "arrayOptions",
          },
        ],
      },
    });

    // Link trigger to action
    await prisma.triggersOnActions.create({
      data: {
        projectId: projectId,
        triggerId: trigger.id,
        actionId: action.id,
        name: "Test Automation",
      },
    });

    // Create a mock job
    const jobData = {
      timestamp: new Date(),
      id: v4(),
      payload: {
        id: promptId,
        name: "test-prompt",
        version: 1,
        projectId: projectId,
        type: "created" as const,
      },
      name: QueueJobs.PromptVersionChangeJob,
    };

    const mockJob = {
      id: v4(),
      data: jobData,
    } as Job<TQueueJobTypes[QueueName.PromptVersionChangeQueue]>;

    // Process the job
    await promptVersionChangeProcessor(mockJob);

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

  it("should handle deleted prompts correctly", async () => {
    // Create and then delete a prompt
    const promptId = v4();
    await prisma.prompt.create({
      data: {
        id: promptId,
        name: "test-prompt",
        version: 1,
        prompt: { text: "Hello {{name}}" },
        projectId: projectId,
        createdBy: "user-1",
      },
    });

    await prisma.prompt.delete({
      where: { id: promptId },
    });

    // Create webhook action and trigger
    const actionId = v4();
    const { secretKey, displaySecretKey } = generateWebhookSecret();

    const action = await prisma.action.create({
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

    const triggerId = v4();
    const trigger = await prisma.trigger.create({
      data: {
        id: triggerId,
        projectId: projectId,
        eventSource: "prompt",
        eventActions: ["deleted"],
        status: JobConfigState.ACTIVE,
        filter: [
          {
            column: "action",
            operator: "any of" as const,
            value: ["deleted"],
            type: "arrayOptions",
          },
        ],
      },
    });

    await prisma.triggersOnActions.create({
      data: {
        projectId: projectId,
        triggerId: trigger.id,
        actionId: action.id,
        name: "Test Automation",
      },
    });

    // Create a mock job for deleted prompt
    const jobData = {
      timestamp: new Date(),
      id: v4(),
      payload: {
        id: promptId,
        name: "test-prompt",
        version: 1,
        projectId: projectId,
        type: "deleted" as const,
      },
      name: QueueJobs.PromptVersionChangeJob,
    };

    const mockJob = {
      id: v4(),
      data: jobData,
    } as Job<TQueueJobTypes[QueueName.PromptVersionChangeQueue]>;

    // Process the job (should work even though prompt is deleted)
    await promptVersionChangeProcessor(mockJob);

    // Verify execution was created for deleted prompt
    const executions = await prisma.actionExecution.findMany({
      where: {
        projectId: projectId,
        triggerId: trigger.id,
        actionId: action.id,
      },
    });

    expect(executions).toHaveLength(1);
    expect(executions[0].input).toMatchObject({
      promptName: "test-prompt",
      promptVersion: 1,
      promptId: promptId,
      action: "deleted",
      type: "prompt",
    });
  });
});
