import {
  type Prisma,
  type PrismaClient,
  type Prompt,
} from "../../../src/index";

type SummaryPrompt = Pick<
  Prompt,
  | "id"
  | "name"
  | "version"
  | "type"
  | "prompt"
  | "labels"
  | "tags"
  | "config"
  | "createdAt"
  | "updatedAt"
  | "createdBy"
  | "projectId"
>;

export async function seedInAppAgentDemoConversation({
  prisma,
  projectId,
  userId,
  summaryPrompt,
}: {
  prisma: PrismaClient;
  projectId: string;
  userId: string;
  summaryPrompt: SummaryPrompt;
}) {
  const conversationId = "aconv_seed_conversation";
  const firstRunId = "arun_seed_intro";
  const secondRunId = "arun_seed_prompt_lookup";
  const firstUserMessageId = "amsg_seed_intro_user";
  const secondUserMessageId = "amsg_seed_prompt_lookup_user";
  const firstAssistantMessageId = "amsg_seed_intro_assistant";
  const secondAssistantMessageId = "amsg_seed_prompt_lookup_assistant";
  const listPromptsToolCallId = "toolu_seed_list_prompts";
  const getPromptToolCallId = "toolu_seed_get_prompt";
  const firstRunCreatedAt = new Date("2026-06-04T07:56:33.794Z");
  const firstRunFinishedAt = new Date("2026-06-04T07:56:42.684Z");
  const secondRunCreatedAt = new Date("2026-06-04T07:56:52.770Z");
  const secondRunFinishedAt = new Date("2026-06-04T07:57:02.810Z");
  const promptContent =
    typeof summaryPrompt.prompt === "string"
      ? summaryPrompt.prompt
      : JSON.stringify(summaryPrompt.prompt);
  const labelsText =
    summaryPrompt.labels.length > 0 ? summaryPrompt.labels.join(", ") : "None";
  const tagsText =
    summaryPrompt.tags.length > 0 ? summaryPrompt.tags.join(", ") : "None";
  const promptCreatedAt = summaryPrompt.createdAt.toISOString();
  const promptUpdatedAt = summaryPrompt.updatedAt.toISOString();

  const listPromptsResult = JSON.stringify({
    data: [
      {
        name: summaryPrompt.name,
        type: summaryPrompt.type,
        versions: [summaryPrompt.version],
        labels: summaryPrompt.labels,
        tags: summaryPrompt.tags,
        lastUpdatedAt: promptUpdatedAt,
        lastConfig: summaryPrompt.config,
      },
    ],
    meta: {
      page: 1,
      limit: 50,
      totalItems: 1,
      totalPages: 1,
    },
  });
  const getPromptResult = JSON.stringify({
    id: summaryPrompt.id,
    name: summaryPrompt.name,
    version: summaryPrompt.version,
    type: summaryPrompt.type,
    prompt: promptContent,
    labels: summaryPrompt.labels,
    tags: summaryPrompt.tags,
    config: summaryPrompt.config,
    createdAt: promptCreatedAt,
    updatedAt: promptUpdatedAt,
    createdBy: summaryPrompt.createdBy,
    projectId: summaryPrompt.projectId,
  });
  const assistantIntro =
    "I'm your Langfuse assistant! I can help you with:\n\n" +
    "**Langfuse Data & Analysis:**\n" +
    "- Query and explore your traces, observations, and spans\n" +
    "- Review and analyze scores, annotations, and feedback\n" +
    "- Inspect datasets, prompts, and experiment runs\n" +
    "- Understand your application's performance metrics\n" +
    "- Retrieve specific traces, observations, or scores by ID\n\n" +
    "**Prompts & Configuration:**\n" +
    "- Fetch and review prompts (including specific versions or labels)\n" +
    "- Check prompt dependencies and structures\n" +
    "- Look up models and score configurations\n\n" +
    "**Codebase & Development:**\n" +
    "- Explore and search your codebase\n" +
    "- Understand file structure and patterns\n" +
    "- Help with code review and analysis\n" +
    "- Assist with git operations and commits\n" +
    "- Run and manage tasks\n\n" +
    "**What would you like to do?** Some common examples:\n" +
    '- "Show me traces from the last hour"\n' +
    '- "Get the latest version of [prompt name]"\n' +
    '- "What scores have been created recently?"\n' +
    '- "Help me find [file/function] in the codebase"\n' +
    '- "Review my pull request"\n\n' +
    "Just let me know what you need!";
  const assistantPromptSummary =
    "**Your Prompts:**\n\n" +
    "You have **1 prompt** in your project:\n\n" +
    "| Name | Type | Version | Labels |\n" +
    "|------|------|---------|--------|\n" +
    `| \`${summaryPrompt.name}\` | ${summaryPrompt.type} | ${summaryPrompt.version} | ${labelsText} |\n\n` +
    `**Content of ${summaryPrompt.name} (v${summaryPrompt.version}):**\n\n` +
    "```\n" +
    `${promptContent}\n` +
    "```\n\n" +
    "**Details:**\n" +
    `- **ID**: ${summaryPrompt.id}\n` +
    `- **Created**: ${formatInAppAgentSeedDate(summaryPrompt.createdAt)}\n` +
    `- **Created by**: ${summaryPrompt.createdBy}\n` +
    `- **Labels**: ${labelsText}\n` +
    `- **Tags**: ${tagsText}\n\n` +
    "The prompt uses two template variables: `{{variable}}` and `{{anotherVariable}}`.";

  const eventRows: Array<{
    projectId: string;
    conversationId: string;
    runId: string;
    sequenceNumber: number;
    type: string;
    event: Prisma.InputJsonValue;
    createdAt: Date;
  }> = [];
  const addEvent = (
    runId: string,
    type: string,
    event: Record<string, unknown>,
  ) => {
    const sequenceNumber = eventRows.length;
    eventRows.push({
      projectId,
      conversationId,
      runId,
      sequenceNumber,
      type,
      event: event as Prisma.InputJsonValue,
      createdAt: new Date(firstRunFinishedAt.getTime() + sequenceNumber * 1000),
    });
  };

  addEvent(firstRunId, "RUN_STARTED", {
    type: "RUN_STARTED",
    threadId: conversationId,
    runId: firstRunId,
    input: {
      threadId: conversationId,
      runId: firstRunId,
      state: null,
      messages: [
        {
          id: firstUserMessageId,
          role: "user",
          content: "Hi, what can you help me with?",
        },
      ],
      tools: [],
      context: [],
      forwardedProps: {},
    },
  });
  addEvent(firstRunId, "TEXT_MESSAGE_START", {
    type: "TEXT_MESSAGE_START",
    messageId: firstAssistantMessageId,
    role: "assistant",
  });
  addEvent(firstRunId, "TEXT_MESSAGE_CONTENT", {
    type: "TEXT_MESSAGE_CONTENT",
    messageId: firstAssistantMessageId,
    delta: assistantIntro,
  });
  addEvent(firstRunId, "TEXT_MESSAGE_END", {
    type: "TEXT_MESSAGE_END",
    messageId: firstAssistantMessageId,
  });
  addEvent(firstRunId, "RUN_FINISHED", {
    type: "RUN_FINISHED",
    threadId: conversationId,
    runId: firstRunId,
  });
  addEvent(secondRunId, "RUN_STARTED", {
    type: "RUN_STARTED",
    threadId: conversationId,
    runId: secondRunId,
    input: {
      threadId: conversationId,
      runId: secondRunId,
      state: null,
      messages: [
        {
          id: secondUserMessageId,
          role: "user",
          content:
            "List my prompts and give me the content of the first prompt.",
        },
      ],
      tools: [],
      context: [],
      forwardedProps: {},
    },
  });
  addEvent(secondRunId, "TOOL_CALL_START", {
    type: "TOOL_CALL_START",
    toolCallId: listPromptsToolCallId,
    toolCallName: "listPrompts",
    parentMessageId: "amsg_seed_list_prompts_tool_parent",
  });
  addEvent(secondRunId, "TOOL_CALL_ARGS", {
    type: "TOOL_CALL_ARGS",
    toolCallId: listPromptsToolCallId,
    delta: '{"page": 1, "limit": 50}',
  });
  addEvent(secondRunId, "TOOL_CALL_END", {
    type: "TOOL_CALL_END",
    toolCallId: listPromptsToolCallId,
  });
  addEvent(secondRunId, "TOOL_CALL_RESULT", {
    type: "TOOL_CALL_RESULT",
    messageId: `${listPromptsToolCallId}-result`,
    toolCallId: listPromptsToolCallId,
    role: "tool",
    content: listPromptsResult,
  });
  addEvent(secondRunId, "TOOL_CALL_START", {
    type: "TOOL_CALL_START",
    toolCallId: getPromptToolCallId,
    toolCallName: "getPrompt",
    parentMessageId: "amsg_seed_get_prompt_tool_parent",
  });
  addEvent(secondRunId, "TOOL_CALL_ARGS", {
    type: "TOOL_CALL_ARGS",
    toolCallId: getPromptToolCallId,
    delta: `{"name": "${summaryPrompt.name}"}`,
  });
  addEvent(secondRunId, "TOOL_CALL_END", {
    type: "TOOL_CALL_END",
    toolCallId: getPromptToolCallId,
  });
  addEvent(secondRunId, "TOOL_CALL_RESULT", {
    type: "TOOL_CALL_RESULT",
    messageId: `${getPromptToolCallId}-result`,
    toolCallId: getPromptToolCallId,
    role: "tool",
    content: getPromptResult,
  });
  addEvent(secondRunId, "TEXT_MESSAGE_START", {
    type: "TEXT_MESSAGE_START",
    messageId: secondAssistantMessageId,
    role: "assistant",
  });
  addEvent(secondRunId, "TEXT_MESSAGE_CONTENT", {
    type: "TEXT_MESSAGE_CONTENT",
    messageId: secondAssistantMessageId,
    delta: assistantPromptSummary,
  });
  addEvent(secondRunId, "TEXT_MESSAGE_END", {
    type: "TEXT_MESSAGE_END",
    messageId: secondAssistantMessageId,
  });
  addEvent(secondRunId, "RUN_FINISHED", {
    type: "RUN_FINISHED",
    threadId: conversationId,
    runId: secondRunId,
  });

  await prisma.$transaction(async (tx) => {
    await tx.inAppAgentEvent.deleteMany({
      where: { projectId, conversationId },
    });
    await tx.inAppAgentRun.deleteMany({
      where: { projectId, conversationId },
    });
    await tx.inAppAgentConversation.upsert({
      where: {
        id_projectId: {
          id: conversationId,
          projectId,
        },
      },
      create: {
        id: conversationId,
        projectId,
        createdByUserId: userId,
        title: "Seed Conversation",
        createdAt: firstRunCreatedAt,
        updatedAt: secondRunFinishedAt,
      },
      update: {
        createdByUserId: userId,
        title: "Seed Conversation",
        providerSessionId: null,
        deletedAt: null,
        updatedAt: secondRunFinishedAt,
      },
    });
    await tx.inAppAgentRun.createMany({
      data: [
        {
          id: firstRunId,
          projectId,
          conversationId,
          triggeredByUserId: userId,
          model: "haiku",
          finishedAt: firstRunFinishedAt,
          createdAt: firstRunCreatedAt,
          updatedAt: firstRunFinishedAt,
        },
        {
          id: secondRunId,
          projectId,
          conversationId,
          triggeredByUserId: userId,
          model: "haiku",
          finishedAt: secondRunFinishedAt,
          createdAt: secondRunCreatedAt,
          updatedAt: secondRunFinishedAt,
        },
      ],
    });
    await tx.inAppAgentEvent.createMany({
      data: eventRows,
    });
  });
}

function formatInAppAgentSeedDate(date: Date) {
  return date
    .toISOString()
    .replace("T", " at ")
    .replace(/\.\d{3}Z$/, " UTC");
}
