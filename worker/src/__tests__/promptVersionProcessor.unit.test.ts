import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionExecutionStatus, PromptType } from "@langfuse/shared";

const { mockPrisma, mockWebhookQueueInstance } = vi.hoisted(() => {
  return {
    mockPrisma: {
      automationExecution: {
        create: vi.fn(),
        update: vi.fn(),
      },
    },
    mockWebhookQueueInstance: {
      add: vi.fn(),
    },
  };
});

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    getTriggerConfigurations: vi.fn().mockResolvedValue([
      {
        id: "trigger-1",
        projectId: "project-1",
        actionIds: ["action-1"],
      },
    ]),
    getActionById: vi.fn().mockResolvedValue({ id: "action-1" }),
    getAutomations: vi.fn().mockResolvedValue([
      {
        id: "automation-1",
        action: { id: "action-1", type: "WEBHOOK" },
      },
    ]),
    matchesTriggerFilter: vi.fn().mockReturnValue(true),
    WebhookQueue: {
      getInstance: vi.fn().mockReturnValue(mockWebhookQueueInstance),
    },
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      isLevelEnabled: vi.fn().mockReturnValue(false),
    },
  };
});

import { promptVersionProcessor } from "../features/entityChange/promptVersionProcessor";
import { skillVersionProcessor } from "../features/entityChange/skillVersionProcessor";
import { WebhookQueue } from "@langfuse/shared/src/server";

describe("entityChange automation execution error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(WebhookQueue.getInstance).mockReturnValue(
      mockWebhookQueueInstance as unknown as ReturnType<
        typeof WebhookQueue.getInstance
      >,
    );
  });

  it("updates automationExecution status to ERROR when prompt WebhookQueue.add fails", async () => {
    const enqueueError = new Error("Redis connection dropped");
    mockWebhookQueueInstance.add.mockRejectedValueOnce(enqueueError);
    mockPrisma.automationExecution.create.mockResolvedValueOnce({
      id: "exec-123",
      status: ActionExecutionStatus.PENDING,
    });
    mockPrisma.automationExecution.update.mockResolvedValueOnce({
      id: "exec-123",
      status: ActionExecutionStatus.ERROR,
    });

    const event = {
      entityType: "prompt-version" as const,
      projectId: "project-1",
      promptId: "prompt-1",
      action: "created" as const,
      prompt: {
        id: "prompt-1",
        projectId: "project-1",
        name: "test-prompt",
        version: 1,
        prompt: { messages: [{ role: "user", content: "Hello" }] },
        config: null,
        tags: [],
        labels: [],
        type: PromptType.Chat,
        isActive: true,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        commitMessage: null,
      },
      user: {
        id: "user-1",
        name: "User 1",
        email: "user1@example.com",
      },
    };

    await promptVersionProcessor(event);

    expect(mockPrisma.automationExecution.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.automationExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ActionExecutionStatus.PENDING,
        }),
      }),
    );

    expect(mockPrisma.automationExecution.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.automationExecution.update).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      data: expect.objectContaining({
        status: ActionExecutionStatus.ERROR,
        error: "Redis connection dropped",
        finishedAt: expect.any(Date),
      }),
    });
  });

  it("updates automationExecution status to ERROR when prompt WebhookQueue is unavailable", async () => {
    vi.mocked(WebhookQueue.getInstance).mockReturnValueOnce(null);
    mockPrisma.automationExecution.create.mockResolvedValueOnce({
      id: "exec-123",
      status: ActionExecutionStatus.PENDING,
    });
    mockPrisma.automationExecution.update.mockResolvedValueOnce({
      id: "exec-123",
      status: ActionExecutionStatus.ERROR,
    });

    const event = {
      entityType: "prompt-version" as const,
      projectId: "project-1",
      promptId: "prompt-1",
      action: "created" as const,
      prompt: {
        id: "prompt-1",
        projectId: "project-1",
        name: "test-prompt",
        version: 1,
        prompt: { messages: [{ role: "user", content: "Hello" }] },
        config: null,
        tags: [],
        labels: [],
        type: PromptType.Chat,
        isActive: true,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        commitMessage: null,
      },
      user: {
        id: "user-1",
        name: "User 1",
        email: "user1@example.com",
      },
    };

    await promptVersionProcessor(event);

    expect(mockPrisma.automationExecution.update).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      data: expect.objectContaining({
        status: ActionExecutionStatus.ERROR,
        error: "WebhookQueue instance is not available",
        finishedAt: expect.any(Date),
      }),
    });
  });

  it("updates automationExecution status to ERROR when skill WebhookQueue.add fails", async () => {
    const enqueueError = new Error("Redis cluster timeout");
    mockWebhookQueueInstance.add.mockRejectedValueOnce(enqueueError);
    mockPrisma.automationExecution.create.mockResolvedValueOnce({
      id: "exec-456",
      status: ActionExecutionStatus.PENDING,
    });
    mockPrisma.automationExecution.update.mockResolvedValueOnce({
      id: "exec-456",
      status: ActionExecutionStatus.ERROR,
    });

    const event = {
      entityType: "skill-version" as const,
      projectId: "project-1",
      skillId: "skill-1",
      action: "created" as const,
      skill: {
        id: "skill-1",
        projectId: "project-1",
        name: "test-skill",
        version: 1,
        tags: [],
        labels: [],
      },
      user: {
        id: "user-1",
        name: "User 1",
        email: "user1@example.com",
      },
    };

    await skillVersionProcessor(event);

    expect(mockPrisma.automationExecution.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.automationExecution.update).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      data: expect.objectContaining({
        status: ActionExecutionStatus.ERROR,
        error: "Redis cluster timeout",
        finishedAt: expect.any(Date),
      }),
    });
  });
});
