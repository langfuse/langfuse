import type { Session } from "next-auth";
import { EventType } from "@ag-ui/core";
import { randomUUID } from "crypto";

import type { Plan } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  getScoreById,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import {
  createInAppAgentConversationId,
  createInAppAgentRunId,
} from "@/src/ee/features/in-app-agent/ids";
import { type AgUiEvent } from "@/src/ee/features/in-app-agent/schema";
import { inAppAgentRouter } from "@/src/ee/features/in-app-agent/server/router";
import {
  createRun,
  ensureOwnedConversation,
  finishRun,
  getConversationMessagesForReplay,
  replaceRunEvents,
  shouldFlushPersistedEvent,
  toPersistableAgentEvent,
} from "@/src/ee/features/in-app-agent/server/persistence";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { IN_APP_AGENT_REDIRECT_TOOL_NAME } from "@/src/ee/features/in-app-agent/constants";
import waitForExpect from "wait-for-expect";

describe("in-app agent persistence", () => {
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalAiFeaturesProjectId = env.LANGFUSE_AI_FEATURES_PROJECT_ID;

  beforeEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
  });

  afterEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    (env as any).LANGFUSE_AI_FEATURES_PROJECT_ID = originalAiFeaturesProjectId;
  });

  const createCaller = async (
    userId = `user-${randomUUID()}`,
    plan: Plan = "cloud:hobby",
  ) => {
    const setup = await createOrgProjectAndApiKey();

    await prisma.organization.update({
      where: { id: setup.orgId },
      data: { aiFeaturesEnabled: true, aiTelemetryEnabled: true },
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
            plan,
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
      conversationId: params.conversationId ?? createInAppAgentConversationId(),
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
      runId: params.runId ?? createInAppAgentRunId(),
      projectId: params.projectId,
      conversationId: params.conversationId,
      triggeredByUserId: params.userId,
      model: "haiku",
      mcpApiKeyId: "api-key-id-1",
    });

  it("rejects users without the in-app agent entitlement", async () => {
    const { caller, projectId } = await createCaller(
      `user-${randomUUID()}`,
      "oss",
    );

    await expect(caller.listConversations({ projectId })).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
        message: expect.stringContaining("in-app-agent"),
      },
    );
  });

  const startCompactRun = async (params: {
    projectId: string;
    conversationId: string;
    runId: string;
    messageId: string;
    content: string;
  }) => {
    const userMessage = {
      id: params.messageId,
      role: "user" as const,
      content: params.content,
    };
    const events: AgUiEvent[] = [
      {
        type: EventType.RUN_STARTED,
        threadId: params.conversationId,
        runId: params.runId,
        input: {
          threadId: params.conversationId,
          runId: params.runId,
          state: null,
          messages: [userMessage],
          tools: [],
          context: [],
          forwardedProps: {},
        },
      },
    ];

    await replaceRunEvents({
      prisma,
      projectId: params.projectId,
      conversationId: params.conversationId,
      runId: params.runId,
      events,
    });

    return events;
  };

  const processAndPersistEvent = async (params: {
    projectId: string;
    conversationId: string;
    runId: string;
    events: AgUiEvent[];
    event: AgUiEvent;
  }) => {
    const persistedEvent = toPersistableAgentEvent(params.event);

    if (!persistedEvent) {
      return;
    }

    params.events.push(persistedEvent);

    if (!shouldFlushPersistedEvent(persistedEvent)) {
      return;
    }

    await replaceRunEvents({
      prisma,
      projectId: params.projectId,
      conversationId: params.conversationId,
      runId: params.runId,
      events: params.events,
    });
  };

  const appendAssistantText = async (params: {
    projectId: string;
    conversationId: string;
    runId: string;
    events: AgUiEvent[];
    messageId: string;
    chunks: string[];
  }) => {
    await processAndPersistEvent({
      ...params,
      event: {
        type: EventType.TEXT_MESSAGE_START,
        messageId: params.messageId,
        role: "assistant",
      },
    });

    for (const delta of params.chunks) {
      await processAndPersistEvent({
        ...params,
        event: {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: params.messageId,
          delta,
        },
      });
    }

    await processAndPersistEvent({
      ...params,
      event: {
        type: EventType.TEXT_MESSAGE_END,
        messageId: params.messageId,
      },
    });
  };

  const createPersistedAssistantMessage = async (params: {
    projectId: string;
    userId: string;
    userMessageId: string;
    userContent: string;
    assistantMessageId: string;
    assistantChunks: string[];
  }) => {
    const conversation = await createConversation({
      projectId: params.projectId,
      userId: params.userId,
    });
    const run = await createConversationRun({
      projectId: params.projectId,
      conversationId: conversation.id,
      userId: params.userId,
    });
    const events = await startCompactRun({
      projectId: params.projectId,
      conversationId: conversation.id,
      runId: run.id,
      messageId: params.userMessageId,
      content: params.userContent,
    });
    await appendAssistantText({
      projectId: params.projectId,
      conversationId: conversation.id,
      runId: run.id,
      events,
      messageId: params.assistantMessageId,
      chunks: params.assistantChunks,
    });
    await finishRun({ prisma, runId: run.id, projectId: params.projectId });

    return { conversation, run };
  };

  it("stores compacted events and restores multi-turn messages", async () => {
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

    const events1 = await startCompactRun({
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
      events: events1,
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
    const events2 = await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: run2.id,
      messageId: "user-message-2",
      content: "Inspect the next trace",
    });
    await processAndPersistEvent({
      projectId,
      conversationId: conversation.id,
      runId: run2.id,
      events: events2,
      event: {
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: "assistant-message-2",
        delta: "Next trace",
      },
    });
    await processAndPersistEvent({
      projectId,
      conversationId: conversation.id,
      runId: run2.id,
      events: events2,
      event: {
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: "assistant-message-2",
        delta: " inspected.",
      },
    });
    await processAndPersistEvent({
      projectId,
      conversationId: conversation.id,
      runId: run2.id,
      events: events2,
      event: {
        type: EventType.RUN_FINISHED,
        threadId: conversation.id,
        runId: run2.id,
      },
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
        runId: run1.id,
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
        runId: run2.id,
      },
    ]);

    const events = await prisma.inAppAgentEvent.findMany({
      where: { projectId, conversationId: conversation.id },
      orderBy: { sequenceNumber: "asc" },
      select: { sequenceNumber: true, type: true, event: true },
    });

    expect(events.map((event) => event.sequenceNumber)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_CHUNK,
      EventType.RUN_FINISHED,
    ]);
    expect(events[0]?.event).toMatchObject({
      type: EventType.RUN_STARTED,
      input: {
        messages: [
          {
            id: "user-message-1",
            role: "user",
            content: "Please inspect today's traces for outliers",
          },
        ],
      },
    });
    expect(events[2]?.event).toMatchObject({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "I will inspect recent traces and look for outliers.",
    });
    expect(events[4]?.event).toMatchObject({
      type: EventType.RUN_STARTED,
      input: {
        messages: [
          {
            id: "user-message-2",
            role: "user",
            content: "Inspect the next trace",
          },
        ],
      },
    });
    expect(events[6]?.event).toMatchObject({
      type: EventType.RUN_FINISHED,
    });
    expect(events[5]?.event).toMatchObject({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: "assistant-message-2",
      role: "assistant",
      delta: "Next trace inspected.",
    });

    const listedConversations = await caller.listConversations({ projectId });
    expect(listedConversations.conversations.map((item) => item.id)).toContain(
      conversation.id,
    );
  });

  it("stores feedback, hydrates it on conversation load, and attaches a score to the agent run observation", async () => {
    const scoreProjectId = `in-app-agent-feedback-${randomUUID()}`;
    (env as any).LANGFUSE_AI_FEATURES_PROJECT_ID = scoreProjectId;

    const { caller, projectId, userId } = await createCaller();
    const { conversation, run } = await createPersistedAssistantMessage({
      projectId,
      userId,
      userMessageId: "user-message-feedback",
      userContent: "Can you summarize this?",
      assistantMessageId: "assistant-message-feedback",
      assistantChunks: ["Here is the summary."],
    });

    const created = await caller.submitFeedback({
      projectId,
      conversationId: conversation.id,
      messageId: "assistant-message-feedback",
      value: "thumbs_down",
      comment: "Missed the main point",
    });
    const expectedObservationId = run.id;
    const expectedScoreId = `afbs_assistant-message-feedback_${userId}`;

    expect(created.feedback).toMatchObject({
      value: "thumbs_down",
      comment: "Missed the main point",
    });

    const storedFeedback = await prisma.inAppAgentRunFeedback.findMany({
      where: { projectId, conversationId: conversation.id },
    });
    expect(storedFeedback).toHaveLength(1);
    expect(storedFeedback[0]).toMatchObject({
      projectId,
      conversationId: conversation.id,
      messageId: "assistant-message-feedback",
      createdByUserId: userId,
      value: false,
      comment: "Missed the main point",
    });

    const restored = await caller.getConversation({
      projectId,
      conversationId: conversation.id,
    });
    expect(restored.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "assistant-message-feedback",
          role: "assistant",
          feedback: expect.objectContaining({
            value: "thumbs_down",
            comment: "Missed the main point",
          }),
        }),
      ]),
    );

    await waitForExpect(async () => {
      const score = await getScoreById({
        projectId: scoreProjectId,
        scoreId: expectedScoreId,
      });
      expect(score).toMatchObject({
        id: expectedScoreId,
        projectId: scoreProjectId,
        traceId: conversation.id,
        observationId: expectedObservationId,
        name: "in_app_agent_feedback",
        value: 0,
        source: "ANNOTATION",
        comment: "Missed the main point",
      });
    });

    const updated = await caller.submitFeedback({
      projectId,
      conversationId: conversation.id,
      messageId: "assistant-message-feedback",
      value: "thumbs_up",
      comment: "   ",
    });
    expect(updated.feedback).toMatchObject({
      value: "thumbs_up",
      comment: null,
    });

    const updatedFeedback = await prisma.inAppAgentRunFeedback.findMany({
      where: { projectId, conversationId: conversation.id },
    });
    expect(updatedFeedback).toHaveLength(1);
    expect(updatedFeedback[0]).toMatchObject({
      value: true,
      comment: null,
    });
  });

  it("deletes persisted feedback when feedback value is cleared", async () => {
    (env as any).LANGFUSE_AI_FEATURES_PROJECT_ID =
      `in-app-agent-feedback-clear-${randomUUID()}`;

    const { caller, projectId, userId } = await createCaller();
    const { conversation } = await createPersistedAssistantMessage({
      projectId,
      userId,
      userMessageId: "user-message-feedback-clear",
      userContent: "Can you summarize this?",
      assistantMessageId: "assistant-message-feedback-clear",
      assistantChunks: ["Here is the summary."],
    });

    await caller.submitFeedback({
      projectId,
      conversationId: conversation.id,
      messageId: "assistant-message-feedback-clear",
      value: "thumbs_up",
      comment: "Helpful",
    });

    await expect(
      prisma.inAppAgentRunFeedback.findMany({
        where: { projectId, conversationId: conversation.id },
      }),
    ).resolves.toHaveLength(1);

    await expect(
      caller.submitFeedback({
        projectId,
        conversationId: conversation.id,
        messageId: "assistant-message-feedback-clear",
        value: null,
      }),
    ).resolves.toEqual({ feedback: null });

    await expect(
      prisma.inAppAgentRunFeedback.findMany({
        where: { projectId, conversationId: conversation.id },
      }),
    ).resolves.toEqual([]);

    const restored = await caller.getConversation({
      projectId,
      conversationId: conversation.id,
    });
    const restoredMessage = restored.messages.find(
      (message) => message.id === "assistant-message-feedback-clear",
    );
    expect(restoredMessage).toMatchObject({
      id: "assistant-message-feedback-clear",
      role: "assistant",
    });
    expect(restoredMessage).not.toHaveProperty("feedback");
  });

  it("rejects feedback when AI telemetry is disabled", async () => {
    const scoreProjectId = `in-app-agent-feedback-disabled-${randomUUID()}`;
    (env as any).LANGFUSE_AI_FEATURES_PROJECT_ID = scoreProjectId;

    const { caller, orgId, projectId, userId } = await createCaller();
    await prisma.organization.update({
      where: { id: orgId },
      data: { aiTelemetryEnabled: false },
    });

    const { conversation } = await createPersistedAssistantMessage({
      projectId,
      userId,
      userMessageId: "user-message-feedback-no-telemetry",
      userContent: "Can you summarize this without telemetry?",
      assistantMessageId: "assistant-message-feedback-no-telemetry",
      assistantChunks: ["Here is the private summary."],
    });

    await expect(
      caller.submitFeedback({
        projectId,
        conversationId: conversation.id,
        messageId: "assistant-message-feedback-no-telemetry",
        value: "thumbs_down",
        comment: "Do not export this comment",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Assistant feedback is not enabled",
    });
    const expectedScoreId = `afbs_assistant-message-feedback-no-telemetry_${userId}`;

    const storedFeedback = await prisma.inAppAgentRunFeedback.findMany({
      where: { projectId, conversationId: conversation.id },
    });
    expect(storedFeedback).toHaveLength(0);

    const score = await getScoreById({
      projectId: scoreProjectId,
      scoreId: expectedScoreId,
    });
    expect(score).toBeUndefined();
  });

  it("rejects feedback for non-assistant text messages", async () => {
    (env as any).LANGFUSE_AI_FEATURES_PROJECT_ID =
      `in-app-agent-feedback-rejected-${randomUUID()}`;

    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      messageId: "user-message-feedback-rejected",
      content: "This is a user message",
    });

    await expect(
      caller.submitFeedback({
        projectId,
        conversationId: conversation.id,
        messageId: "user-message-feedback-rejected",
        value: "thumbs_up",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Feedback can only be submitted for assistant text messages",
    });
  });

  it("does not reduce partial assistant content before the end event", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });

    const events = await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      messageId: "partial-user",
      content: "Start a long answer",
    });
    await processAndPersistEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      events,
      event: {
        type: EventType.TEXT_MESSAGE_START,
        messageId: "partial-assistant",
        role: "assistant",
      },
    });
    await processAndPersistEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      events,
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
    ).resolves.toBe(1);
  });

  it("stores and reduces tool calls, tool results, and activities", async () => {
    const { projectId, userId, caller } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });

    const events = await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      messageId: "tool-user",
      content: "Search traces",
    });
    const process = (event: AgUiEvent) =>
      processAndPersistEvent({
        projectId,
        conversationId: conversation.id,
        runId: run.id,
        events,
        event,
      });

    await process({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "tool-assistant",
      role: "assistant",
    });
    await process({
      type: EventType.TOOL_CALL_START,
      toolCallId: "tool-call-1",
      toolCallName: "list_traces",
      parentMessageId: "tool-assistant",
    });
    await process({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "tool-call-1",
      delta: '{"limit":',
    });
    await process({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "tool-call-1",
      delta: "10}",
    });
    await process({
      type: EventType.TOOL_CALL_END,
      toolCallId: "tool-call-1",
    });
    await process({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "tool-assistant",
      delta: "I searched traces.",
    });
    await process({
      type: EventType.TEXT_MESSAGE_END,
      messageId: "tool-assistant",
    });
    await process({
      type: EventType.TOOL_CALL_RESULT,
      messageId: "tool-result-1",
      toolCallId: "tool-call-1",
      content: "[]",
      role: "tool",
    });
    await process({
      type: EventType.REASONING_MESSAGE_START,
      messageId: "reasoning-1",
      role: "reasoning",
    });
    await process({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: "reasoning-1",
      delta: "Checking filters",
    });
    await process({
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: "message",
      entityId: "reasoning-1",
      encryptedValue: "encrypted-reasoning",
    });
    await process({
      type: EventType.REASONING_MESSAGE_END,
      messageId: "reasoning-1",
    });
    await process({
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: "activity-1",
      activityType: "progress",
      content: { status: "done" },
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
    ).resolves.toBe(9);
  });

  it("stores only compact events and skips raw adapter payloads", async () => {
    const { projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });

    const eventsBuffer = await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      messageId: "safe-user",
      content: "visible user text",
    });
    const process = (event: AgUiEvent) =>
      processAndPersistEvent({
        projectId,
        conversationId: conversation.id,
        runId: run.id,
        events: eventsBuffer,
        event,
      });

    await process({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "assistant-safe",
      role: "assistant",
      rawEvent: { token: "raw-text-start-secret" },
    });
    await process({
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
      await process(event);
    }

    const events = await prisma.inAppAgentEvent.findMany({
      where: { projectId, conversationId: conversation.id, runId: run.id },
      orderBy: { sequenceNumber: "asc" },
      select: { type: true, event: true },
    });

    expect(events.map((event) => event.type)).toEqual([EventType.RUN_STARTED]);
    expect(events[0]?.event).toMatchObject({
      type: EventType.RUN_STARTED,
      input: {
        messages: [
          {
            id: "safe-user",
            role: "user",
            content: "visible user text",
          },
        ],
      },
    });
    expect(JSON.stringify(events)).not.toContain("secret");
  });

  it("does not persist adapter message snapshots", async () => {
    const { caller, projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });

    const events = await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      messageId: "snapshot-user",
      content: "Keep this",
    });
    await processAndPersistEvent({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      events,
      event: {
        type: EventType.MESSAGES_SNAPSHOT,
        messages: [
          {
            id: "snapshot-only",
            role: "assistant",
            content: "Restore me from the snapshot",
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

    await expect(
      prisma.inAppAgentEvent.count({
        where: { projectId, conversationId: conversation.id, runId: run.id },
      }),
    ).resolves.toBe(1);
  });

  it("drops trailing user-only turns before replay", async () => {
    const { projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const completedRun = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    const completedEvents = await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: completedRun.id,
      messageId: "user-1",
      content: "first",
    });

    await processAndPersistEvent({
      projectId,
      conversationId: conversation.id,
      runId: completedRun.id,
      events: completedEvents,
      event: {
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: "assistant-1",
        delta: "done",
      },
    });
    await processAndPersistEvent({
      projectId,
      conversationId: conversation.id,
      runId: completedRun.id,
      events: completedEvents,
      event: {
        type: EventType.RUN_FINISHED,
        threadId: conversation.id,
        runId: completedRun.id,
      },
    });
    await finishRun({
      prisma,
      runId: completedRun.id,
      projectId,
    });

    const abandonedRun = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: abandonedRun.id,
      messageId: "orphan-user-1",
      content: "failed",
    });

    await expect(
      getConversationMessagesForReplay({
        prisma,
        projectId,
        conversationId: conversation.id,
      }),
    ).resolves.toEqual([
      { id: "user-1", role: "user", content: "first" },
      { id: "assistant-1", role: "assistant", content: "done" },
      { id: "orphan-user-1", role: "user", content: "failed" },
    ]);
  });

  it("drops assistant tool calls that have no matching tool result", async () => {
    const { projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    const events = await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      messageId: "user-1",
      content: "search",
    });
    const process = (event: AgUiEvent) =>
      processAndPersistEvent({
        projectId,
        conversationId: conversation.id,
        runId: run.id,
        events,
        event,
      });

    await process({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "assistant-1",
      role: "assistant",
    });
    await process({
      type: EventType.TOOL_CALL_START,
      toolCallId: "paired-tool-call",
      toolCallName: "list_traces",
      parentMessageId: "assistant-1",
    });
    await process({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "paired-tool-call",
      delta: "{}",
    });
    await process({
      type: EventType.TOOL_CALL_END,
      toolCallId: "paired-tool-call",
    });
    await process({
      type: EventType.TOOL_CALL_START,
      toolCallId: "orphan-tool-call",
      toolCallName: "get_trace",
      parentMessageId: "assistant-1",
    });
    await process({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "orphan-tool-call",
      delta: "{}",
    });
    await process({
      type: EventType.TOOL_CALL_END,
      toolCallId: "orphan-tool-call",
    });
    await process({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "assistant-1",
      delta: "calling tools",
    });
    await process({
      type: EventType.TEXT_MESSAGE_END,
      messageId: "assistant-1",
    });
    await process({
      type: EventType.TOOL_CALL_RESULT,
      messageId: "tool-result-1",
      toolCallId: "paired-tool-call",
      content: "[]",
      role: "tool",
    });

    await expect(
      getConversationMessagesForReplay({
        prisma,
        projectId,
        conversationId: conversation.id,
      }),
    ).resolves.toEqual([
      { id: "user-1", role: "user", content: "search" },
      {
        id: "assistant-1",
        role: "assistant",
        content: "calling tools",
        toolCalls: [
          {
            id: "paired-tool-call",
            type: "function",
            function: { name: "list_traces", arguments: "{}" },
          },
        ],
      },
      {
        id: "tool-result-1",
        role: "tool",
        content: "[]",
        toolCallId: "paired-tool-call",
      },
    ]);
  });

  it("drops failed redirect tool results before replay", async () => {
    const { projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    const events = await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      messageId: "user-1",
      content: "open a trace",
    });
    const process = (event: AgUiEvent) =>
      processAndPersistEvent({
        projectId,
        conversationId: conversation.id,
        runId: run.id,
        events,
        event,
      });

    await process({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "assistant-1",
      role: "assistant",
    });
    await process({
      type: EventType.TOOL_CALL_START,
      toolCallId: "redirect-tool-call",
      toolCallName: IN_APP_AGENT_REDIRECT_TOOL_NAME,
      parentMessageId: "assistant-1",
    });
    await process({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "redirect-tool-call",
      delta: '{"destination":"trace"}',
    });
    await process({
      type: EventType.TOOL_CALL_END,
      toolCallId: "redirect-tool-call",
    });
    await process({
      type: EventType.TOOL_CALL_RESULT,
      messageId: "tool-result-1",
      toolCallId: "redirect-tool-call",
      content: "Tool validation failed: trace params are required",
      role: "tool",
    });

    await expect(
      getConversationMessagesForReplay({
        prisma,
        projectId,
        conversationId: conversation.id,
      }),
    ).resolves.toEqual([
      { id: "user-1", role: "user", content: "open a trace" },
    ]);
  });

  it("drops empty assistant messages after removing orphan tool calls before replay", async () => {
    const { projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    const events = await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: run.id,
      messageId: "user-1",
      content: "search",
    });
    const process = (event: AgUiEvent) =>
      processAndPersistEvent({
        projectId,
        conversationId: conversation.id,
        runId: run.id,
        events,
        event,
      });

    await process({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "assistant-1",
      role: "assistant",
    });
    await process({
      type: EventType.TOOL_CALL_START,
      toolCallId: "orphan-tool-call",
      toolCallName: "get_trace",
      parentMessageId: "assistant-1",
    });
    await process({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "orphan-tool-call",
      delta: "{}",
    });
    await process({
      type: EventType.TOOL_CALL_END,
      toolCallId: "orphan-tool-call",
    });

    await expect(
      getConversationMessagesForReplay({
        prisma,
        projectId,
        conversationId: conversation.id,
      }),
    ).resolves.toEqual([{ id: "user-1", role: "user", content: "search" }]);
  });

  it("keeps user messages before empty assistant messages removed from replay", async () => {
    const { projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });

    const orphanToolRun = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    const orphanToolEvents = await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: orphanToolRun.id,
      messageId: "user-1",
      content: "search",
    });
    const processOrphanToolEvent = (event: AgUiEvent) =>
      processAndPersistEvent({
        projectId,
        conversationId: conversation.id,
        runId: orphanToolRun.id,
        events: orphanToolEvents,
        event,
      });

    await processOrphanToolEvent({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "assistant-1",
      role: "assistant",
    });
    await processOrphanToolEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: "orphan-tool-call",
      toolCallName: "get_trace",
      parentMessageId: "assistant-1",
    });
    await processOrphanToolEvent({
      type: EventType.TOOL_CALL_END,
      toolCallId: "orphan-tool-call",
    });
    await finishRun({
      prisma,
      runId: orphanToolRun.id,
      projectId,
      errorCode: "aborted",
      errorMessage: "Aborted before tool result",
    });

    const completedRun = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    const completedEvents = await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: completedRun.id,
      messageId: "user-2",
      content: "try again",
    });
    await appendAssistantText({
      projectId,
      conversationId: conversation.id,
      runId: completedRun.id,
      events: completedEvents,
      messageId: "assistant-2",
      chunks: ["done"],
    });

    await expect(
      getConversationMessagesForReplay({
        prisma,
        projectId,
        conversationId: conversation.id,
      }),
    ).resolves.toEqual([
      { id: "user-1", role: "user", content: "search" },
      { id: "user-2", role: "user", content: "try again" },
      { id: "assistant-2", role: "assistant", content: "done" },
    ]);
  });

  it("keeps interior user-only failed turns before replay", async () => {
    const { projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });

    const failedRun = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: failedRun.id,
      messageId: "user-1",
      content: "failed before output",
    });
    await finishRun({
      prisma,
      runId: failedRun.id,
      projectId,
      errorCode: "upstream_error",
      errorMessage: "Failed before output",
    });

    const completedRun = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    const completedEvents = await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: completedRun.id,
      messageId: "user-2",
      content: "try again",
    });
    await appendAssistantText({
      projectId,
      conversationId: conversation.id,
      runId: completedRun.id,
      events: completedEvents,
      messageId: "assistant-2",
      chunks: ["done"],
    });

    await expect(
      getConversationMessagesForReplay({
        prisma,
        projectId,
        conversationId: conversation.id,
      }),
    ).resolves.toEqual([
      { id: "user-1", role: "user", content: "failed before output" },
      { id: "user-2", role: "user", content: "try again" },
      { id: "assistant-2", role: "assistant", content: "done" },
    ]);
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

    const runId = createInAppAgentRunId();
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

  it("ignores event flushes from already-finished runs", async () => {
    const { projectId, userId } = await createCaller();
    const conversation = await createConversation({ projectId, userId });
    const run1 = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    const events1 = await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: run1.id,
      messageId: "user-message-1",
      content: "First",
    });

    await finishRun({ prisma, runId: run1.id, projectId });

    const run2 = await createConversationRun({
      projectId,
      conversationId: conversation.id,
      userId,
    });
    await startCompactRun({
      projectId,
      conversationId: conversation.id,
      runId: run2.id,
      messageId: "user-message-2",
      content: "Second",
    });

    await appendAssistantText({
      projectId,
      conversationId: conversation.id,
      runId: run1.id,
      events: events1,
      messageId: "assistant-message-1",
      chunks: ["Late output"],
    });

    const events = await prisma.inAppAgentEvent.findMany({
      where: { projectId, conversationId: conversation.id },
      orderBy: { sequenceNumber: "asc" },
      select: { runId: true, type: true },
    });

    expect(events).toEqual([
      { runId: run1.id, type: EventType.RUN_STARTED },
      { runId: run2.id, type: EventType.RUN_STARTED },
    ]);
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
      data: { createdAt: new Date("2026-05-20T10:00:00.000Z") },
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
