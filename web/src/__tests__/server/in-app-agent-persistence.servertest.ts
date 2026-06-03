import type { Session } from "next-auth";
import { EventType } from "@ag-ui/core";
import { randomUUID } from "crypto";

import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import type { AgUiEvent } from "@/src/features/in-app-agent/schema";
import { inAppAgentRouter } from "@/src/features/in-app-agent/server/router";
import {
  appendConversationEvent,
  createRun,
  ensureOwnedConversation,
  finishRun,
} from "@/src/features/in-app-agent/server/persistence";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

describe("in-app agent persistence", () => {
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  beforeEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
  });

  afterEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  const createCaller = async (userId = `user-${randomUUID()}`) => {
    const setup = await createOrgProjectAndApiKey();

    await prisma.organization.update({
      where: { id: setup.orgId },
      data: { aiFeaturesEnabled: true },
    });

    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.com`,
      },
    });

    const session: Session = {
      expires: "1",
      user: {
        id: userId,
        name: "Agent User",
        canCreateOrganizations: true,
        organizations: [
          {
            id: setup.orgId,
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            name: "Test Organization",
            metadata: {},
            projects: [
              {
                id: setup.projectId,
                role: "ADMIN",
                name: "Test Project",
                deletedAt: null,
                retentionDays: null,
                metadata: {},
              },
            ],
          },
        ],
        featureFlags: {
          inAppAgent: true,
          templateFlag: true,
          excludeClickhouseRead: false,
        },
        admin: false,
      },
      environment: {} as any,
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });

    return {
      ...setup,
      userId,
      caller: inAppAgentRouter.createCaller({ ...ctx, prisma }),
      session,
    };
  };

  const createConversation = (params: {
    projectId: string;
    userId: string;
    conversationId?: string;
  }) =>
    ensureOwnedConversation({
      prisma,
      projectId: params.projectId,
      conversationId: params.conversationId ?? `conversation-${randomUUID()}`,
      userId: params.userId,
    });

  const createConversationRun = async (params: {
    projectId: string;
    conversationId: string;
    userId: string;
    runId?: string;
  }) =>
    createRun({
      prisma,
      runId: params.runId ?? `run-${randomUUID()}`,
      projectId: params.projectId,
      conversationId: params.conversationId,
      triggeredByUserId: params.userId,
      model: "haiku",
      mcpApiKeyId: "api-key-id-1",
    });

  const appendEvent = async (params: {
    projectId: string;
    conversationId: string;
    runId: string;
    event: AgUiEvent;
  }) =>
    appendConversationEvent({
      prisma,
      projectId: params.projectId,
      conversationId: params.conversationId,
      runId: params.runId,
      event: params.event,
    });

  const appendRunStarted = async (params: {
    projectId: string;
    conversationId: string;
    runId: string;
    messageId: string;
    content: string;
  }) =>
    appendEvent({
      ...params,
      event: {
        type: EventType.RUN_STARTED,
        threadId: params.conversationId,
        runId: params.runId,
        input: {
          threadId: params.conversationId,
          runId: params.runId,
          messages: [
            {
              id: params.messageId,
              role: "user",
              content: params.content,
            },
          ],
          tools: [],
          context: [],
          state: null,
          forwardedProps: {},
        },
      },
    });

  const appendAssistantText = async (params: {
    projectId: string;
    conversationId: string;
    runId: string;
    messageId: string;
    chunks: string[];
  }) => {
    await appendEvent({
      ...params,
      event: {
        type: EventType.TEXT_MESSAGE_START,
        messageId: params.messageId,
        role: "assistant",
      },
    });

    for (const delta of params.chunks) {
      await appendEvent({
        ...params,
        event: {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: params.messageId,
          delta,
        },
      });
    }

    await appendEvent({
      ...params,
      event: {
        type: EventType.TEXT_MESSAGE_END,
        messageId: params.messageId,
      },
    });
  };

  it("stores only ordered events and reduces multi-turn messages", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run1 = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });

    await prisma.inAppAgentConversation.update({
      where: { id_projectId: { id: conversation.id, projectId } },
      data: { providerSessionId: "claude-session-secret" },
    });

    await appendRunStarted({
      projectId,
      conversationId: conversation.id,
      runId: run1.id,
      messageId: "user-message-1",
      content: "Please inspect today's traces for outliers",
    });
    await appendAssistantText({
      projectId,
      conversationId: conversation.id,
      runId: run1.id,
      messageId: "assistant-message-1",
      chunks: ["I will inspect recent traces", " and look for outliers."],
    });
    await finishRun({
      prisma,
      runId: run1.id,
      projectId,
    });

    const run2 = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    await appendRunStarted({
      projectId,
      conversationId: conversation.id,
      runId: run2.id,
      messageId: "user-message-2",
      content: "Inspect the next trace",
    });
    await appendAssistantText({
      projectId,
      conversationId: conversation.id,
      runId: run2.id,
      messageId: "assistant-message-2",
      chunks: ["Next trace inspected."],
    });

    const detail = await caller.getConversation({
      projectId,
      conversationId: conversation.id,
    });

    expect(detail.conversation).not.toHaveProperty("providerSessionId");
    expect(detail.conversation).not.toHaveProperty("provider");
    expect(detail.state).toEqual({
      type: "existingConversation",
      projectId,
      conversationId: conversation.id,
    });
    expect(detail.messages).toEqual([
      {
        id: "user-message-1",
        role: "user",
        content: "Please inspect today's traces for outliers",
      },
      {
        id: "assistant-message-1",
        role: "assistant",
        content: "I will inspect recent traces and look for outliers.",
      },
      {
        id: "user-message-2",
        role: "user",
        content: "Inspect the next trace",
      },
      {
        id: "assistant-message-2",
        role: "assistant",
        content: "Next trace inspected.",
      },
    ]);

    const events = await prisma.inAppAgentEvent.findMany({
      where: { projectId, conversationId: conversation.id },
      orderBy: { sequenceNumber: "asc" },
      select: { sequenceNumber: true, type: true, event: true },
    });

    expect(events.map((event) => event.sequenceNumber)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
    ]);
    expect(events[0]?.event).toMatchObject({
      type: EventType.RUN_STARTED,
      input: {
        messages: [
          {
            id: "user-message-1",
            role: "user",
          },
        ],
      },
    });

    const listedConversations = await caller.listConversations({ projectId });
    expect(listedConversations.conversations.map((item) => item.id)).toContain(
      conversation.id,
    );
  });

  it("does not reduce partial assistant content before the end event", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });

    await appendRunStarted({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      messageId: "partial-user",
      content: "Start a long answer",
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.TEXT_MESSAGE_START,
        messageId: "partial-assistant",
        role: "assistant",
      },
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: "partial-assistant",
        delta: "Half-written",
      },
    });

    await expect(
      caller.getConversation({ projectId, conversationId: conversation.id }),
    ).resolves.toMatchObject({
      messages: [
        {
          id: "partial-user",
          role: "user",
          content: "Start a long answer",
        },
      ],
    });
    await expect(
      prisma.inAppAgentEvent.count({
        where: { projectId, conversationId: conversation.id, runId: run.id },
      }),
    ).resolves.toBe(3);
  });

  it("stores and reduces tool calls, tool results, and activities", async () => {
    const { projectId, userId, caller } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });

    await appendRunStarted({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      messageId: "tool-user",
      content: "Search traces",
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.TEXT_MESSAGE_START,
        messageId: "tool-assistant",
        role: "assistant",
      },
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-call-1",
        toolCallName: "list_traces",
        parentMessageId: "tool-assistant",
      },
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-call-1",
        delta: '{"limit":',
      },
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-call-1",
        delta: "10}",
      },
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tool-call-1",
      },
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: "tool-assistant",
        delta: "I searched traces.",
      },
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.TEXT_MESSAGE_END,
        messageId: "tool-assistant",
      },
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.TOOL_CALL_RESULT,
        messageId: "tool-result-1",
        toolCallId: "tool-call-1",
        content: "[]",
        role: "tool",
      },
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.REASONING_MESSAGE_START,
        messageId: "reasoning-1",
        role: "reasoning",
      },
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: "reasoning-1",
        delta: "Checking filters",
      },
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.REASONING_ENCRYPTED_VALUE,
        subtype: "message",
        entityId: "reasoning-1",
        encryptedValue: "encrypted-reasoning",
      },
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.REASONING_MESSAGE_END,
        messageId: "reasoning-1",
      },
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: "activity-1",
        activityType: "progress",
        content: { status: "done" },
      },
    });

    await expect(
      caller.getConversation({ projectId, conversationId: conversation.id }),
    ).resolves.toMatchObject({
      messages: [
        {
          id: "tool-user",
          role: "user",
          content: "Search traces",
        },
        {
          id: "tool-assistant",
          role: "assistant",
          content: "I searched traces.",
          toolCalls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "list_traces",
                arguments: '{"limit":10}',
              },
            },
          ],
        },
        {
          id: "tool-result-1",
          role: "tool",
          content: "[]",
          toolCallId: "tool-call-1",
        },
        {
          id: "activity-1",
          role: "activity",
          activityType: "progress",
          content: { status: "done" },
        },
      ],
    });

    await expect(
      prisma.inAppAgentEvent.count({
        where: { projectId, conversationId: conversation.id, runId: run.id },
      }),
    ).resolves.toBe(10);
  });

  it("redacts persisted events before storing raw adapter payloads", async () => {
    const { projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    const append = (event: AgUiEvent) =>
      appendEvent({
        projectId,
        conversationId: conversation.id,
        runId: run.id,
        event,
      });

    await append({
      type: EventType.RUN_STARTED,
      threadId: conversation.id,
      runId: run.id,
      parentRunId: "parent-run",
      input: {
        threadId: conversation.id,
        runId: run.id,
        messages: [
          {
            id: "safe-user",
            role: "user",
            content: "visible user text",
          },
          {
            id: "hidden-system",
            role: "system",
            content: "system-message-secret",
          },
        ],
        tools: [{ name: "tool", description: "tool-secret" }],
        context: [{ description: "ctx", value: "context-secret" }],
        state: { providerSessionId: "state-secret" },
        forwardedProps: { resume: "resume-session-secret" },
      },
      rawEvent: { providerSessionId: "raw-run-secret" },
    });
    await append({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "assistant-safe",
      role: "assistant",
      rawEvent: { token: "raw-text-start-secret" },
    });
    await append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "assistant-safe",
      delta: "visible assistant text",
      rawEvent: { token: "raw-text-content-secret" },
      providerSessionId: "content-secret",
    });

    for (const event of [
      {
        type: EventType.CUSTOM,
        name: "system:status",
        value: { session_id: "provider-status-secret" },
      },
      {
        type: EventType.STATE_DELTA,
        delta: [
          {
            op: "replace",
            path: "",
            value: { providerSessionId: "state-delta-secret" },
          },
        ],
      },
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: "reasoning-1",
        delta: "reasoning-secret",
      },
      {
        type: EventType.RAW,
        event: { Authorization: "Basic raw-secret" },
      },
    ]) {
      await append(event);
    }

    const events = await prisma.inAppAgentEvent.findMany({
      where: { projectId, conversationId: conversation.id, runId: run.id },
      orderBy: { sequenceNumber: "asc" },
      select: { type: true, event: true },
    });

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
    ]);
    expect(events[0]?.event).toEqual({
      type: EventType.RUN_STARTED,
      threadId: conversation.id,
      runId: run.id,
      parentRunId: "parent-run",
      input: {
        threadId: conversation.id,
        runId: run.id,
        messages: [
          {
            id: "safe-user",
            role: "user",
            content: "visible user text",
          },
        ],
      },
    });
    expect(events[1]?.event).toEqual({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "assistant-safe",
      role: "assistant",
    });
    expect(events[2]?.event).toEqual({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "assistant-safe",
      delta: "visible assistant text",
    });
    expect(JSON.stringify(events)).not.toContain("secret");
  });

  it("ignores adapter message snapshots when reducing history", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });

    await appendRunStarted({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      messageId: "snapshot-user",
      content: "Keep this",
    });
    await appendEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      event: {
        type: EventType.MESSAGES_SNAPSHOT,
        messages: [
          {
            id: "snapshot-only",
            role: "assistant",
            content: "Do not restore me",
          },
        ],
      },
    });

    await expect(
      caller.getConversation({ projectId, conversationId: conversation.id }),
    ).resolves.toMatchObject({
      messages: [
        {
          id: "snapshot-user",
          role: "user",
          content: "Keep this",
        },
      ],
    });
  });

  it("does not expose another user's conversation in the same project", async () => {
    const owner = await createCaller();
    const otherUserId = `user-${randomUUID()}`;

    await prisma.user.create({
      data: {
        id: otherUserId,
        email: `${otherUserId}@example.com`,
      },
    });

    const otherSession: Session = {
      ...owner.session,
      user: {
        ...owner.session.user!,
        id: otherUserId,
      },
    };

    const otherCtx = createInnerTRPCContext({
      session: otherSession,
      headers: {},
    });
    const otherCaller = inAppAgentRouter.createCaller({ ...otherCtx, prisma });

    const conversation = await createConversation({
      projectId: owner.projectId,
      userId: owner.userId,
    });

    await expect(
      otherCaller.getConversation({
        projectId: owner.projectId,
        conversationId: conversation.id,
      }),
    ).rejects.toThrow("Agent conversation not found");

    const visibleConversations = await otherCaller.listConversations({
      projectId: owner.projectId,
    });

    expect(visibleConversations.conversations).toEqual([]);
    expect(visibleConversations.nextCursor).toBeUndefined();
  });

  it("allows conversation and run ids to repeat across projects", async () => {
    const owner = await createCaller();
    const other = await createCaller();
    const conversation = await createConversation({
      projectId: owner.projectId,
      userId: owner.userId,
    });

    const otherConversation = await ensureOwnedConversation({
      prisma,
      projectId: other.projectId,
      conversationId: conversation.id,
      userId: other.userId,
    });

    expect(otherConversation).toMatchObject({
      id: conversation.id,
      projectId: other.projectId,
      createdByUserId: other.userId,
    });

    const runId = `run-${randomUUID()}`;
    await createConversationRun({
      projectId: owner.projectId,
      conversationId: conversation.id,
      userId: owner.userId,
      runId,
    });
    await expect(
      createConversationRun({
        projectId: other.projectId,
        conversationId: otherConversation.id,
        userId: other.userId,
        runId,
      }),
    ).resolves.toMatchObject({
      id: runId,
      projectId: other.projectId,
    });
  });

  it("finishes runs once and preserves the first terminal error", async () => {
    const { projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });

    expect(run.mcpApiKeyId).toBe("api-key-id-1");
    expect(run.finishedAt).toBeNull();

    await finishRun({
      prisma,
      runId: run.id,
      projectId,
      errorCode: "agent_error",
      errorMessage: "Original agent error",
    });
    await finishRun({
      prisma,
      runId: run.id,
      projectId,
      errorCode: "cancelled",
      errorMessage: "Client aborted request",
    });

    await expect(
      prisma.inAppAgentRun.findUniqueOrThrow({
        where: { id_projectId: { id: run.id, projectId } },
      }),
    ).resolves.toMatchObject({
      errorCode: "agent_error",
      errorMessage: "Original agent error",
    });
  });

  it("blocks a second active run in the same conversation", async () => {
    const { projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });

    await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });

    await expect(
      createConversationRun({
        projectId,
        conversationId: conversation.id,
        userId,
      }),
    ).rejects.toThrow("Assistant is already responding in this conversation");
  });

  it("marks old unfinished runs stale before starting a new run", async () => {
    const { projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const staleRun = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });

    await prisma.inAppAgentRun.update({
      where: { id_projectId: { id: staleRun.id, projectId } },
      data: { startedAt: new Date("2026-05-20T10:00:00.000Z") },
    });

    const newRun = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });

    await expect(
      prisma.inAppAgentRun.findUniqueOrThrow({
        where: { id_projectId: { id: staleRun.id, projectId } },
      }),
    ).resolves.toMatchObject({
      errorCode: "stale",
      errorMessage: "Run was marked stale before starting a new run",
    });
    expect(newRun.finishedAt).toBeNull();
  });

  it("paginates conversation list with a stable cursor", async () => {
    const { caller, projectId, userId } = await createCaller();
    const idPrefix = `pagination-${randomUUID()}`;
    const latest = new Date("2026-05-20T10:00:00.000Z");
    const middle = new Date("2026-05-20T09:00:00.000Z");
    const oldest = new Date("2026-05-20T08:00:00.000Z");

    await prisma.inAppAgentConversation.createMany({
      data: [
        {
          id: `${idPrefix}-a`,
          projectId,
          createdByUserId: userId,
          createdAt: latest,
          updatedAt: latest,
        },
        {
          id: `${idPrefix}-b`,
          projectId,
          createdByUserId: userId,
          createdAt: latest,
          updatedAt: latest,
        },
        {
          id: `${idPrefix}-c`,
          projectId,
          createdByUserId: userId,
          createdAt: middle,
          updatedAt: middle,
        },
        {
          id: `${idPrefix}-d`,
          projectId,
          createdByUserId: userId,
          createdAt: oldest,
          updatedAt: oldest,
        },
      ],
    });

    const firstPage = await caller.listConversations({ projectId, limit: 2 });

    expect(firstPage.conversations.map((item) => item.id)).toEqual([
      `${idPrefix}-b`,
      `${idPrefix}-a`,
    ]);
    expect(firstPage.nextCursor).toEqual({
      updatedAt: latest,
      id: `${idPrefix}-a`,
    });

    const secondPage = await caller.listConversations({
      projectId,
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.conversations.map((item) => item.id)).toEqual([
      `${idPrefix}-c`,
      `${idPrefix}-d`,
    ]);
    expect(secondPage.nextCursor).toBeUndefined();
  });
});
