import { EventType } from "@ag-ui/core";
import { getInternalTracingHandler, logger } from "@langfuse/shared/src/server";

import type {
  AgUiEvent,
  AgUiMessage,
  AgUiRunAgentInput,
} from "@/src/ee/features/in-app-agent/schema";
import { compactTextMessageChunks } from "@/src/ee/features/in-app-agent/server/eventCompaction";
import type { InAppAgentUserAccess } from "@/src/ee/features/in-app-agent/server/tools";

export type InAppAgentTracingConfig = {
  environment: string;
  metadata: Record<string, unknown>;
  user: {
    id: string;
    email?: string | null;
    projectRole?: InAppAgentUserAccess["projectRole"];
    // Global Langfuse admin flag. This bypasses project membership checks.
    isAdmin: boolean;
  };
  traceId: string;
  targetProjectId: string;
  prompt?: InAppAgentPromptMetadata;
};

export type InAppAgentInstrumentationParams = {
  input: AgUiRunAgentInput;
  tracing?: InAppAgentTracingConfig;
};

export type InAppAgentPromptMetadata = {
  name: string;
  version: number;
};

const IN_APP_AGENT_TRACE_NAME = "in-app-agent";
const IN_APP_AGENT_RUN_NAME = "agent-run";
type InternalTracingHandler = ReturnType<typeof getInternalTracingHandler>;
type InAppAgentTrace = ReturnType<
  InternalTracingHandler["handler"]["langfuse"]["trace"]
>;
type InAppAgentGeneration = ReturnType<InAppAgentTrace["generation"]>;
type InAppAgentLangfuse = InternalTracingHandler["handler"]["langfuse"];
type AgentRunToolCall = {
  id: string;
  name: string;
  arguments: string;
  type: "function";
};
type AgentRunToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
};
type AgentRunSkillDefinition = {
  name: string;
  description?: string;
};
type AgentRunChatMessage = {
  role: string;
  name?: string;
  content?: unknown;
  tool_calls?: AgentRunToolCall[];
  tool_call_id?: string;
};
type ToolObservationBody = {
  id: string;
  traceId: string;
  parentObservationId: string | null;
  name: string;
  startTime: Date;
  endTime: Date;
  completionStartTime: Date;
  input?: unknown;
  output?: unknown;
  level?: "ERROR";
  statusMessage?: string;
  metadata?: Record<string, unknown>;
};
type ToolCallApprovalStatus = "approved" | "rejected";

export function createInAppAgentInstrumentation({
  input,
  tracing,
}: InAppAgentInstrumentationParams) {
  if (!tracing?.targetProjectId) {
    return undefined;
  }

  try {
    return new InAppAgentInstrumentation({
      input,
      metadata: tracing.metadata,
      userId: tracing.user.id,
      userEmail: tracing.user.email,
      userProjectRole: tracing.user.projectRole,
      userIsAdmin: tracing.user.isAdmin,
      traceId: tracing.traceId,
      targetProjectId: tracing.targetProjectId,
      environment: tracing.environment,
      prompt: tracing.prompt,
    });
  } catch (error) {
    logger.warn("Failed to initialize in-app agent Langfuse tracing", error);
    return undefined;
  }
}

export class InAppAgentInstrumentation {
  private readonly processTracedEvents: () => Promise<void>;
  private readonly langfuse: InAppAgentLangfuse;
  private readonly trace: InAppAgentTrace;
  private readonly agentRun: InAppAgentGeneration;
  private agentRunInput: unknown;
  private readonly prompt?: InAppAgentPromptMetadata;
  private readonly toolSpans = new Map<
    string,
    {
      name: string;
      startTime: Date;
      args: string;
      argsComplete: boolean;
      output?: unknown;
      parentMessageId?: string;
    }
  >();
  private readonly toolCallApprovals = new Map<
    string,
    ToolCallApprovalStatus
  >();
  private readonly metadata: Record<string, unknown>;
  private readonly agentRunOutputMessages: AgentRunChatMessage[] = [];
  private readonly agentRunToolCalls: AgentRunToolCall[] = [];
  private output = "";
  private reasoning = "";
  private completionStartTime?: Date;
  private ended = false;

  constructor(params: {
    input: AgUiRunAgentInput;
    metadata: Record<string, unknown>;
    userId: string;
    userEmail?: string | null;
    userProjectRole?: InAppAgentUserAccess["projectRole"];
    userIsAdmin: boolean;
    traceId: string;
    targetProjectId: string;
    environment: string;
    prompt?: InAppAgentPromptMetadata;
  }) {
    this.metadata = {
      ...params.metadata,
      ...(params.userEmail ? { langfuse_user_email: params.userEmail } : {}),
      ...(params.userProjectRole
        ? { langfuse_user_project_role: params.userProjectRole }
        : {}),
      langfuse_user_is_admin: params.userIsAdmin,
      ...(params.prompt
        ? {
            prompt_name: params.prompt.name,
            prompt_version: params.prompt.version,
          }
        : {}),
    };
    this.agentRunInput = getAgentRunInput(params.input);
    this.prompt = params.prompt;

    const traceSinkParams = {
      targetProjectId: params.targetProjectId,
      traceId: params.traceId,
      traceName: IN_APP_AGENT_TRACE_NAME,
      environment: params.environment,
      userId: params.userId,
      metadata: this.metadata,
      prompt: params.prompt,
    };
    const { handler, processTracedEvents } =
      getInternalTracingHandler(traceSinkParams);
    this.processTracedEvents = processTracedEvents;
    this.langfuse = handler.langfuse;

    this.trace = this.langfuse.trace({
      id: params.traceId,
      name: IN_APP_AGENT_TRACE_NAME,
      userId: params.userId,
      sessionId: params.input.threadId,
      metadata: this.metadata,
      tags: ["in-app-agent"],
    });
    this.agentRun = this.trace.generation({
      id: params.input.runId,
      name: IN_APP_AGENT_RUN_NAME,
      input: this.agentRunInput,
      metadata: this.metadata,
      ...(params.prompt
        ? {
            promptName: params.prompt.name,
            promptVersion: params.prompt.version,
          }
        : {}),
    });
  }

  recordEvents(events: AgUiEvent[]) {
    if (this.ended) {
      return;
    }

    const compactedEvents = compactTextMessageChunks(events);

    for (const event of compactedEvents) {
      this.recordEvent(event);
    }
  }

  recordAvailableTools(tools: Record<string, unknown>) {
    if (this.ended) {
      return;
    }

    const availableTools = getAgentRunAvailableTools(tools);

    if (availableTools.length === 0) {
      return;
    }

    this.agentRunInput = addAvailableToolsToAgentRunInput(
      this.agentRunInput,
      availableTools,
    );
  }

  recordToolCallApproval(approval?: {
    toolCallId: string;
    status: ToolCallApprovalStatus;
  }) {
    if (this.ended || !approval) {
      return;
    }

    this.toolCallApprovals.set(approval.toolCallId, approval.status);
  }

  recordAvailableSkills(skills: unknown[]) {
    if (this.ended) {
      return;
    }

    const availableSkills = getAgentRunAvailableSkills(skills);

    if (availableSkills.length === 0) {
      return;
    }

    this.agentRunInput = addAvailableSkillsToAgentRunInput(
      this.agentRunInput,
      availableSkills,
    );
  }

  endWithError(error: unknown) {
    if (this.ended) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.endOpenToolSpans({ error: message }, message);
    this.agentRun.update({
      name: IN_APP_AGENT_RUN_NAME,
      input: this.agentRunInput,
      output: this.getAgentRunOutput(),
      ...(this.completionStartTime
        ? { completionStartTime: this.completionStartTime }
        : {}),
      level: "ERROR",
      statusMessage: message,
      metadata: {
        ...this.metadata,
        ...(this.reasoning ? { reasoning: this.reasoning } : {}),
        error: message,
      },
      ...(this.prompt
        ? {
            promptName: this.prompt.name,
            promptVersion: this.prompt.version,
          }
        : {}),
    });
    this.trace.update({
      metadata: { ...this.metadata, error: message },
    });
    this.agentRun.end();
    this.ended = true;
  }

  end(params?: { aborted?: boolean; result?: unknown }) {
    if (this.ended) {
      return;
    }

    this.endOpenToolSpans(params?.aborted ? { aborted: true } : undefined);
    const metadata = {
      ...this.metadata,
      ...(this.reasoning ? { reasoning: this.reasoning } : {}),
      ...(params?.aborted ? { aborted: true } : {}),
      ...(params?.result ? { result: params.result } : {}),
    };
    this.agentRun.update({
      name: IN_APP_AGENT_RUN_NAME,
      input: this.agentRunInput,
      output: this.getAgentRunOutput(),
      ...(this.completionStartTime
        ? { completionStartTime: this.completionStartTime }
        : {}),
      metadata,
      ...(this.prompt
        ? {
            promptName: this.prompt.name,
            promptVersion: this.prompt.version,
          }
        : {}),
    });
    this.trace.update({ metadata });
    this.agentRun.end();
    this.ended = true;
  }

  flush() {
    this.processTracedEvents().catch((error) => {
      logger.warn("Failed to flush in-app agent Langfuse tracing", error);
    });
  }

  private recordEvent(event: AgUiEvent) {
    switch (event.type) {
      case EventType.TEXT_MESSAGE_CHUNK:
      case EventType.TEXT_MESSAGE_CONTENT:
        if (typeof event.delta === "string") {
          this.recordAssistantText(event.delta);
        }
        return;
      case EventType.REASONING_MESSAGE_CHUNK:
      case EventType.REASONING_MESSAGE_CONTENT:
        if (typeof event.delta === "string") {
          this.reasoning += event.delta;
        }
        return;
      case EventType.TOOL_CALL_START:
        this.startToolSpan(event);
        return;
      case EventType.TOOL_CALL_ARGS:
        this.appendToolArgs(event);
        return;
      case EventType.TOOL_CALL_RESULT:
        this.recordToolResult(event);
        return;
      case EventType.TOOL_CALL_END:
        this.endToolSpan(event);
        return;
      case EventType.RUN_ERROR:
        this.endWithError(
          typeof event.message === "string"
            ? event.message
            : "Unknown assistant error",
        );
        return;
      case EventType.RUN_FINISHED:
        this.end({ result: event.result });
        return;
      case EventType.RUN_STARTED:
      case EventType.TEXT_MESSAGE_START:
      case EventType.TEXT_MESSAGE_END:
      case EventType.STATE_SNAPSHOT:
      case EventType.STATE_DELTA:
      case EventType.MESSAGES_SNAPSHOT:
      case EventType.ACTIVITY_SNAPSHOT:
      case EventType.ACTIVITY_DELTA:
      case EventType.RAW:
      case EventType.CUSTOM:
      case EventType.STEP_STARTED:
      case EventType.STEP_FINISHED:
      case EventType.REASONING_START:
      case EventType.REASONING_MESSAGE_START:
      case EventType.REASONING_MESSAGE_END:
      case EventType.REASONING_END:
      case EventType.REASONING_ENCRYPTED_VALUE:
        return;
      default:
        return;
    }
  }

  private startToolSpan(event: AgUiEvent) {
    if (typeof event.toolCallId !== "string") {
      return;
    }

    const name =
      typeof event.toolCallName === "string" ? event.toolCallName : "tool-call";
    this.toolSpans.set(event.toolCallId, {
      name,
      startTime: new Date(),
      args: "",
      argsComplete: false,
      ...(typeof event.parentMessageId === "string"
        ? { parentMessageId: event.parentMessageId }
        : {}),
    });
  }

  private appendToolArgs(event: AgUiEvent) {
    if (
      typeof event.toolCallId !== "string" ||
      typeof event.delta !== "string"
    ) {
      return;
    }

    const tool = this.toolSpans.get(event.toolCallId);
    if (tool) {
      tool.args += event.delta;
    }
  }

  private recordToolResult(event: AgUiEvent) {
    if (typeof event.toolCallId !== "string") {
      return;
    }

    const tool = this.toolSpans.get(event.toolCallId);
    if (tool) {
      tool.output = event.content;
      this.endToolSpanIfComplete(event.toolCallId, tool);
    }
  }

  private endToolSpan(event: AgUiEvent) {
    if (typeof event.toolCallId !== "string") {
      return;
    }

    const tool = this.toolSpans.get(event.toolCallId);
    if (!tool) {
      return;
    }

    tool.argsComplete = true;
    this.endToolSpanIfComplete(event.toolCallId, tool);
  }

  private endToolSpanIfComplete(
    toolCallId: string,
    tool: {
      name: string;
      startTime: Date;
      args: string;
      argsComplete: boolean;
      output?: unknown;
      parentMessageId?: string;
    },
  ) {
    if (!tool.argsComplete || tool.output === undefined) {
      return;
    }

    this.createToolObservation(toolCallId, tool);
    this.toolSpans.delete(toolCallId);
  }

  private createToolObservation(
    toolCallId: string,
    tool: {
      name: string;
      startTime: Date;
      args: string;
      argsComplete: boolean;
      output?: unknown;
      parentMessageId?: string;
    },
    options?: {
      metadata?: Record<string, unknown>;
      statusMessage?: string;
    },
  ) {
    const input = parseJsonOrUndefined(tool.args);
    const output =
      tool.output === undefined ? undefined : normalizeToolOutput(tool.output);
    const isError = options?.statusMessage !== undefined || isToolError(output);
    const toolCallApproval = this.toolCallApprovals.get(toolCallId);
    const body: ToolObservationBody = {
      id: toolCallId,
      traceId: this.agentRun.traceId,
      parentObservationId: this.agentRun.observationId,
      name: tool.name,
      startTime: tool.startTime,
      endTime: new Date(),
      completionStartTime: tool.startTime,
      input,
      output,
      ...(isError ? { level: "ERROR" } : {}),
      ...(options?.statusMessage
        ? { statusMessage: options.statusMessage }
        : {}),
      metadata: {
        ...(options?.metadata ?? {}),
        toolCallId,
        ...(toolCallApproval ? { toolCallApproval } : {}),
        ...(tool.argsComplete ? {} : { argsComplete: false }),
        ...(tool.parentMessageId
          ? { parentMessageId: tool.parentMessageId }
          : {}),
      },
    };

    this.recordToolCall(toolCallId, tool, output);
    this.toolCallApprovals.delete(toolCallId);

    (
      this.langfuse as unknown as {
        enqueue: (type: string, body: ToolObservationBody) => void;
      }
    ).enqueue("tool-create", body);
  }

  private endOpenToolSpans(
    metadata?: Record<string, unknown>,
    statusMessage?: string,
  ) {
    for (const [toolCallId, tool] of this.toolSpans.entries()) {
      this.createToolObservation(toolCallId, tool, {
        metadata,
        statusMessage,
      });
      this.toolSpans.delete(toolCallId);
    }
  }

  private recordAssistantText(delta: string) {
    this.output += delta;
    this.completionStartTime ??= new Date();

    const lastMessage = this.agentRunOutputMessages.at(-1);
    if (lastMessage?.role === "assistant" && !lastMessage.tool_calls?.length) {
      lastMessage.content = `${typeof lastMessage.content === "string" ? lastMessage.content : ""}${delta}`;
      return;
    }

    this.agentRunOutputMessages.push({
      role: "assistant",
      content: delta,
    });
  }

  private recordToolCall(
    toolCallId: string,
    tool: {
      name: string;
      args: string;
      startTime: Date;
    },
    output: unknown,
  ) {
    this.completionStartTime ??= tool.startTime;

    const toolCall: AgentRunToolCall = {
      id: toolCallId,
      name: tool.name,
      arguments: tool.args || "{}",
      type: "function",
    };

    this.agentRunToolCalls.push(toolCall);
    this.agentRunOutputMessages.push({
      role: "assistant",
      content: "",
      tool_calls: [toolCall],
    });

    if (output !== undefined) {
      this.agentRunOutputMessages.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: output,
      });
    }
  }

  private getAgentRunOutput() {
    if (this.agentRunOutputMessages.length === 0) {
      return undefined;
    }

    return {
      messages: this.agentRunOutputMessages,
      ...(this.output ? { text: this.output } : {}),
      ...(this.agentRunToolCalls.length > 0
        ? { tool_calls: this.agentRunToolCalls }
        : {}),
    };
  }
}

function getAgentRunInput(input: AgUiRunAgentInput): unknown {
  const messages = getAgentRunMessages(input.messages);
  const context = getAgentRunContext(input);

  if (!context) {
    return { messages };
  }

  return {
    messages,
    context,
  };
}

function addAvailableToolsToAgentRunInput(
  input: unknown,
  tools: AgentRunToolDefinition[],
) {
  if (!isRecord(input)) {
    return input;
  }

  return {
    ...input,
    tools,
  };
}

function addAvailableSkillsToAgentRunInput(
  input: unknown,
  skills: AgentRunSkillDefinition[],
) {
  if (!isRecord(input)) {
    return input;
  }

  return {
    ...input,
    skills,
  };
}

function getAgentRunAvailableTools(
  tools: Record<string, unknown>,
): AgentRunToolDefinition[] {
  return Object.entries(tools).map(([name, tool]) => {
    const toolRecord = isRecord(tool) ? tool : {};
    const description = getStringValue(toolRecord.description);
    const parameters = getSerializableToolParameters(toolRecord);

    return {
      type: "function" as const,
      function: {
        name,
        ...(description ? { description } : {}),
        ...(parameters ? { parameters } : {}),
      },
    };
  });
}

function getAgentRunAvailableSkills(
  skills: unknown[],
): AgentRunSkillDefinition[] {
  return skills.flatMap((skill) => {
    const skillRecord = isRecord(skill) ? skill : {};
    const name = getStringValue(skillRecord.name);

    if (!name) {
      return [];
    }

    const description = getStringValue(skillRecord.description);

    return [
      {
        name,
        ...(description ? { description } : {}),
      },
    ];
  });
}

function getAgentRunMessages(messages: AgUiMessage[]): AgentRunChatMessage[] {
  return messages.flatMap((message): AgentRunChatMessage[] => {
    switch (message.role) {
      case "developer":
      case "system":
        return [
          {
            role: message.role,
            ...(message.name ? { name: message.name } : {}),
            content: message.content,
          },
        ];
      case "user":
        return [
          {
            role: "user",
            ...(message.name ? { name: message.name } : {}),
            content: normalizeUserMessageContent(message.content),
          },
        ];
      case "assistant": {
        const toolCalls = message.toolCalls?.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
          type: "function" as const,
        }));

        if (!message.content && !toolCalls?.length) {
          return [];
        }

        return [
          {
            role: "assistant",
            ...(message.name ? { name: message.name } : {}),
            content: message.content ?? "",
            ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
          },
        ];
      }
      case "tool":
        return [
          {
            role: "tool",
            tool_call_id: message.toolCallId,
            content: parseJsonOrString(message.content),
          },
        ];
      case "activity":
      case "reasoning":
        return [];
    }
  });
}

function normalizeUserMessageContent(
  content: Extract<AgUiMessage, { role: "user" }>["content"],
): unknown {
  if (typeof content === "string") {
    return content;
  }

  if (content.every((part) => part.type === "text")) {
    return content.map((part) => part.text).join("");
  }

  return content;
}

function getAgentRunContext(input: AgUiRunAgentInput) {
  if (input.context.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    input.context.map((item) => [
      item.description,
      parseContextValue(item.description, item.value),
    ]),
  );
}

function parseContextValue(description: string, value: string): unknown {
  const parsed = parseJsonOrString(value);

  if (description === "browser_languages" && typeof parsed === "string") {
    return parsed
      .split(",")
      .map((language) => language.trim())
      .filter(Boolean);
  }

  return parsed;
}

function normalizeToolOutput(output: unknown): unknown {
  const parsedOutput =
    typeof output === "string" ? parseJsonOrString(output) : output;

  if (!isRecord(parsedOutput) || !Array.isArray(parsedOutput.content)) {
    return parsedOutput;
  }

  const firstContent = parsedOutput.content[0];

  if (
    parsedOutput.content.length !== 1 ||
    !isRecord(firstContent) ||
    firstContent.type !== "text" ||
    typeof firstContent.text !== "string"
  ) {
    return parsedOutput;
  }

  return parseJsonOrString(firstContent.text);
}

function isToolError(output: unknown): boolean {
  return isRecord(output) && output.error === true;
}

function getSerializableToolParameters(tool: Record<string, unknown>): unknown {
  const parameters =
    tool.parameters ??
    tool.inputSchema ??
    tool.parameters_json_schema ??
    tool.input_schema;

  return toSerializableJson(parameters);
}

function toSerializableJson(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (value === null || typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    if (depth >= 8) {
      return undefined;
    }

    return value
      .map((item) => toSerializableJson(item, seen, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return undefined;
  }

  if (seen.has(value)) {
    return undefined;
  }

  if (depth >= 8) {
    return undefined;
  }

  seen.add(value);

  const entries = Object.entries(value).flatMap(([key, item]) => {
    const serializableItem = toSerializableJson(item, seen, depth + 1);

    return serializableItem === undefined
      ? []
      : [[key, serializableItem] as const];
  });

  seen.delete(value);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseJsonOrUndefined(value: string): unknown {
  if (!value) {
    return undefined;
  }

  return parseJsonOrString(value);
}

function parseJsonOrString(value: string): unknown {
  if (!value) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
