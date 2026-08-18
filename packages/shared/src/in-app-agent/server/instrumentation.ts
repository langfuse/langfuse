import { EventType } from "@ag-ui/core";
import { getInternalTracingHandler, logger } from "../../server";

import {
  getInAppAgentInstrumentationObservationId,
  getInAppAgentInstrumentationTraceId,
  getInAppAgentLlmCallObservationId,
} from "../constants";
import {
  ResumeForwardedPropsSchema,
  type AgUiEvent,
  type AgUiMessage,
  type AgUiRunAgentInput,
} from "../schema";
import { compactTextMessageChunks } from "./eventCompaction";
import {
  getToolFailureMessage,
  isRecord,
  normalizeToolOutput,
  parseJsonOrString,
} from "./toolErrors";
import type { InAppAgentUserAccess } from "./tools";
import { assertUnreachable } from "../../utils/typeChecks";

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
  runId: string;
  targetProjectId: string;
  prompt?: InAppAgentPromptMetadata;
};

export type InAppAgentInstrumentationParams = {
  input: AgUiRunAgentInput;
  tracing?: InAppAgentTracingConfig;
  model?: string;
};

export type InAppAgentPromptMetadata = {
  name: string;
  version: number;
};

const IN_APP_AGENT_TURN_NAME = "agent-turn";
const IN_APP_AGENT_LLM_CALL_NAME = "invoke-model";
type InternalTracingHandler = ReturnType<typeof getInternalTracingHandler>;
type InAppAgentTrace = ReturnType<
  InternalTracingHandler["handler"]["langfuse"]["trace"]
>;
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
// Matches the ChatML thinking content part
// (packages/shared/src/utils/IORepresentation/chatML/types.ts) so the trace UI
// renders reasoning as collapsible "Thinking" blocks.
type AgentRunThinkingPart = {
  type: "thinking";
  content: string;
};
type AgentRunChatMessage = {
  role: string;
  name?: string;
  content?: unknown;
  thinking?: AgentRunThinkingPart[];
  tool_calls?: AgentRunToolCall[];
  tool_call_id?: string;
};
type ObservationBody = {
  id: string;
  traceId: string;
  parentObservationId?: string | null;
  name: string;
  startTime: Date;
  endTime: Date;
  completionStartTime?: Date;
  input?: unknown;
  output?: unknown;
  model?: string;
  usageDetails?: Record<string, number>;
  level?: "DEFAULT" | "ERROR";
  statusMessage?: string | null;
  metadata?: Record<string, unknown>;
  promptName?: string;
  promptVersion?: number;
};
type ToolCallApprovalStatus = "approved" | "rejected";
type AgentRunToolSpan = {
  name: string;
  startTime: Date;
  args: string;
  argsComplete: boolean;
  output?: unknown;
  failureMessage?: string;
  parentMessageId?: string;
};
// Lightweight bookmark for the in-flight Mastra step. Generations are emitted
// from onStepFinish (which carries usage); this only supplies start timing and
// the input-message boundary for context-growth visibility.
type OpenLlmStep = {
  stepNumber: number;
  startTime: Date;
  inputMessageCount: number;
  completionStartTime?: Date;
  providerFinish?: Record<string, unknown>;
  providerFinishTime?: Date;
};
type ToolExecutionTimes = {
  startTime?: Date;
  endTime?: Date;
};
type ApprovalContinuation = {
  status: ToolCallApprovalStatus;
  continuationNumber: number;
  rootRunId: string;
  toolCallId: string;
  toolName: string;
  traceStartedAt?: Date;
  approvalRequestedAt?: Date;
  approvalDecidedAt?: Date;
  metadata: Record<string, unknown>;
};

export function createInAppAgentInstrumentation({
  input,
  tracing,
  model,
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
      runId: tracing.runId,
      targetProjectId: tracing.targetProjectId,
      environment: tracing.environment,
      prompt: tracing.prompt,
      model,
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
  private readonly runId: string;
  private readonly traceId: string;
  private readonly rootObservationId: string;
  private readonly traceStartTime: Date;
  private readonly agentRunStartTime: Date;
  private agentRunInput: unknown;
  private readonly approvalContinuation?: ApprovalContinuation;
  private readonly prompt?: InAppAgentPromptMetadata;
  private readonly toolSpans = new Map<string, AgentRunToolSpan>();
  private readonly toolCallApprovals = new Map<
    string,
    ToolCallApprovalStatus
  >();
  private readonly toolExecutionTimes = new Map<string, ToolExecutionTimes>();
  private readonly metadata: Record<string, unknown>;
  private readonly agentRunOutputMessages: AgentRunChatMessage[] = [];
  private readonly agentRunToolCalls: AgentRunToolCall[] = [];
  private output = "";
  private currentReasoning = "";
  private pendingThinking: AgentRunThinkingPart[] = [];
  private ended = false;
  private readonly model?: string;
  private nextStepNumber = 0;
  private openLlmStep?: OpenLlmStep;
  // Tools that finished while an LLM step was still open. Emit after the
  // generation so the tree sorts model → tools (tool-call chunks arrive during
  // the LLM stream, before onStepFinish).
  private readonly deferredToolCompletions = new Map<
    string,
    AgentRunToolSpan
  >();
  // Clamp tool execution windows to start at/after the last generation end.
  private lastLlmGenerationEndTime?: Date;

  constructor(params: {
    input: AgUiRunAgentInput;
    metadata: Record<string, unknown>;
    userId: string;
    userEmail?: string | null;
    userProjectRole?: InAppAgentUserAccess["projectRole"];
    userIsAdmin: boolean;
    runId: string;
    targetProjectId: string;
    environment: string;
    prompt?: InAppAgentPromptMetadata;
    model?: string;
  }) {
    this.approvalContinuation = getApprovalContinuation(params.input);
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
      ...(this.approvalContinuation
        ? {
            approval_continuation_count:
              this.approvalContinuation.continuationNumber,
          }
        : {}),
    };
    this.agentRunInput = getAgentRunInput(params.input);
    this.prompt = params.prompt;
    this.model = params.model;
    this.runId = params.runId;
    const rootRunId = this.approvalContinuation?.rootRunId ?? params.runId;
    this.traceId = getInAppAgentInstrumentationTraceId(rootRunId);
    this.rootObservationId =
      getInAppAgentInstrumentationObservationId(rootRunId);
    this.agentRunStartTime = new Date();
    this.traceStartTime =
      this.approvalContinuation?.traceStartedAt ?? this.agentRunStartTime;

    const traceSinkParams = {
      targetProjectId: params.targetProjectId,
      traceId: this.traceId,
      traceName: IN_APP_AGENT_TURN_NAME,
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
      id: this.traceId,
      name: IN_APP_AGENT_TURN_NAME,
      userId: params.userId,
      sessionId: params.input.threadId,
      timestamp: this.traceStartTime,
      input: this.getTraceInput(),
      metadata: this.metadata,
      tags: ["in-app-agent"],
    });

    // Create the root observation immediately so tool/generation children
    // emitted during the run have a parent that already exists (avoids
    // orphans that attach to the trace as siblings of the late agent).
    this.emitRootAgentObservation({ metadata: this.metadata });
    this.emitApprovalWaitObservation();
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

  recordToolExecutionStart(toolCallId: string) {
    if (this.ended) {
      return;
    }

    const times = this.toolExecutionTimes.get(toolCallId) ?? {};
    times.startTime ??= new Date();
    this.toolExecutionTimes.set(toolCallId, times);
  }

  recordToolExecutionEnd(toolCallId: string) {
    if (this.ended) {
      return;
    }

    const times = this.toolExecutionTimes.get(toolCallId) ?? {};
    times.endTime ??= new Date();
    this.toolExecutionTimes.set(toolCallId, times);
  }

  // Bedrock's V3 stream emits exact usage before Mastra executes tools. Keep
  // it on the open step as a fallback because approval suspension can end the
  // run without Mastra ever invoking onStepFinish.
  recordModelCallFinish(event: unknown) {
    if (!isRecord(event)) {
      return;
    }

    if (this.ended) {
      return;
    }

    const now = new Date();
    this.ensureOpenLlmStep(now);
    if (this.openLlmStep) {
      this.openLlmStep.providerFinish = event;
      this.openLlmStep.providerFinishTime = now;
    }
  }

  // Mastra stream chunks: step-start (or first model delta) bookmarks the LLM
  // window; tool-result ends tool execution. Do not treat tool-call chunks as
  // execution start — they fire while the model is still streaming.
  // Usage and output still come from recordStepFinish.
  recordStreamChunk(chunk: unknown) {
    if (this.ended || !isRecord(chunk)) {
      return;
    }

    const type = chunk.type;
    if (typeof type !== "string") {
      return;
    }

    const payload = isRecord(chunk.payload) ? chunk.payload : {};
    const now = new Date();

    if (type === "step-start") {
      // A prior step should have been closed by onStepFinish. If not, emit it
      // as an error so we never silently drop a generation.
      if (this.openLlmStep) {
        const providerFinish = this.openLlmStep.providerFinish;
        this.emitLlmGeneration(
          this.openLlmStep,
          undefined,
          providerFinish
            ? undefined
            : {
                level: "ERROR",
                statusMessage: "LLM step closed by a subsequent step-start",
              },
        );
        this.flushDeferredToolCompletions();
      }

      this.openLlmStep = {
        stepNumber: ++this.nextStepNumber,
        startTime: now,
        inputMessageCount: this.agentRunOutputMessages.length,
      };
      return;
    }

    // tool-call means "model requested this tool", not "tool started".
    // Ensure an LLM step is open so missing step-start still gets a real window.
    if (type === "tool-call") {
      this.ensureOpenLlmStep(now);
      return;
    }

    if (type === "tool-result" || type === "tool-error") {
      const toolCallId = getStringValue(payload.toolCallId);
      if (!toolCallId) {
        return;
      }

      const times = this.toolExecutionTimes.get(toolCallId) ?? {};
      times.endTime ??= now;
      this.toolExecutionTimes.set(toolCallId, times);
      return;
    }

    if (
      type === "text-delta" ||
      type === "reasoning-delta" ||
      type === "reasoning"
    ) {
      this.ensureOpenLlmStep(now);
      if (this.openLlmStep) {
        this.openLlmStep.completionStartTime ??= now;
      }
    }
  }

  // Receives Mastra's per-LLM-call onStepFinish event and emits one generation
  // with that call's usage/model. The AG-UI event stream itself never carries usage.
  recordStepFinish(event: unknown) {
    if (this.ended) {
      return;
    }

    const step =
      this.openLlmStep ??
      ({
        stepNumber: ++this.nextStepNumber,
        // Prefer a non-zero window when step-start never arrived: backdate to
        // the last generation end (or run start) so tools do not sort above us.
        startTime: this.lastLlmGenerationEndTime ?? this.agentRunStartTime,
        inputMessageCount: this.agentRunOutputMessages.length,
      } satisfies OpenLlmStep);

    this.emitLlmGeneration(step, event);
    this.openLlmStep = undefined;
    this.flushDeferredToolCompletions();
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
    this.endOpenLlmStep({ error: message }, message);
    this.endOpenToolSpans({ error: message }, message);
    this.flushTrailingThinking();
    this.emitRootAgentObservation({
      level: "ERROR",
      statusMessage: message,
      metadata: {
        ...this.metadata,
        error: message,
      },
    });
    this.trace.update({
      input: this.getTraceInput(),
      output: this.getAgentRunOutput(),
      metadata: { ...this.metadata, error: message },
    });
    this.ended = true;
  }

  end(params?: { aborted?: boolean; result?: unknown }) {
    if (this.ended) {
      return;
    }

    if (params?.aborted) {
      this.endOpenLlmStep({ aborted: true }, "aborted");
    } else {
      this.endOpenLlmStep();
    }
    this.endOpenToolSpans(params?.aborted ? { aborted: true } : undefined);
    this.flushTrailingThinking();
    const metadata = {
      ...this.metadata,
      ...(params?.aborted ? { aborted: true } : {}),
      ...(params?.result ? { result: params.result } : {}),
    };
    this.emitRootAgentObservation({ metadata });
    this.trace.update({
      input: this.getTraceInput(),
      output: this.getAgentRunOutput(),
      metadata,
    });
    this.ended = true;
  }

  flush() {
    this.processTracedEvents().catch((error) => {
      logger.warn("Failed to flush in-app agent Langfuse tracing", error);
    });
  }

  private recordEvent(event: AgUiEvent) {
    if (
      event.type === EventType.TEXT_MESSAGE_CHUNK ||
      event.type === EventType.TEXT_MESSAGE_CONTENT
    ) {
      if (typeof event.delta === "string") {
        this.recordAssistantText(event.delta);
      }
      return;
    }

    if (
      event.type === EventType.REASONING_MESSAGE_CHUNK ||
      event.type === EventType.REASONING_MESSAGE_CONTENT
    ) {
      if (typeof event.delta === "string") {
        this.currentReasoning += event.delta;
      }
      return;
    }

    if (
      event.type === EventType.REASONING_MESSAGE_START ||
      event.type === EventType.REASONING_MESSAGE_END
    ) {
      this.flushCurrentReasoning();
      return;
    }

    if (event.type === EventType.TOOL_CALL_START) {
      this.startToolSpan(event);
      return;
    }

    if (event.type === EventType.TOOL_CALL_ARGS) {
      this.appendToolArgs(event);
      return;
    }

    if (event.type === EventType.TOOL_CALL_RESULT) {
      this.recordToolResult(event);
      return;
    }

    if (event.type === EventType.TOOL_CALL_END) {
      this.endToolSpan(event);
      return;
    }

    if (event.type === EventType.RUN_ERROR) {
      this.endWithError(
        typeof event.message === "string"
          ? event.message
          : "Unknown assistant error",
      );
      return;
    }

    if (event.type === EventType.RUN_FINISHED) {
      this.end({ result: event.result });
      return;
    }

    if (
      event.type === EventType.RUN_STARTED ||
      event.type === EventType.TEXT_MESSAGE_START ||
      event.type === EventType.TEXT_MESSAGE_END ||
      event.type === EventType.STATE_SNAPSHOT ||
      event.type === EventType.STATE_DELTA ||
      event.type === EventType.MESSAGES_SNAPSHOT ||
      event.type === EventType.ACTIVITY_SNAPSHOT ||
      event.type === EventType.ACTIVITY_DELTA ||
      event.type === EventType.RAW ||
      event.type === EventType.CUSTOM ||
      event.type === EventType.STEP_STARTED ||
      event.type === EventType.STEP_FINISHED ||
      event.type === EventType.TOOL_CALL_CHUNK ||
      event.type === EventType.REASONING_START ||
      event.type === EventType.REASONING_END ||
      event.type === EventType.REASONING_ENCRYPTED_VALUE ||
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      event.type === EventType.THINKING_START ||
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      event.type === EventType.THINKING_END ||
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      event.type === EventType.THINKING_TEXT_MESSAGE_START ||
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      event.type === EventType.THINKING_TEXT_MESSAGE_CONTENT ||
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      event.type === EventType.THINKING_TEXT_MESSAGE_END
    ) {
      return;
    }

    return assertUnreachable(event.type);
  }

  private startToolSpan(event: AgUiEvent) {
    if (typeof event.toolCallId !== "string") {
      return;
    }

    const name =
      typeof event.toolCallName === "string" ? event.toolCallName : "tool-call";
    // Execution start = AG-UI tool-call start (or later clamp to generation end).
    // Mastra tool-call chunks are request-time and must not set this.
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
      tool.failureMessage = getToolFailureMessage(event.error, event.content);
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

  private endToolSpanIfComplete(toolCallId: string, tool: AgentRunToolSpan) {
    if (!tool.argsComplete || tool.output === undefined) {
      return;
    }

    // Tool-call args/results often arrive while the LLM step is still open.
    // Hold the observation until step-finish so the tree sorts generation → tools.
    if (this.openLlmStep) {
      this.deferredToolCompletions.set(toolCallId, tool);
      this.toolSpans.delete(toolCallId);
      return;
    }

    this.createToolObservation(toolCallId, tool);
    this.toolSpans.delete(toolCallId);
  }

  private createToolObservation(
    toolCallId: string,
    tool: AgentRunToolSpan,
    options?: {
      metadata?: Record<string, unknown>;
      statusMessage?: string;
    },
  ) {
    const input = parseJsonOrUndefined(tool.args);
    const output =
      tool.output === undefined ? undefined : normalizeToolOutput(tool.output);
    const failureMessage =
      options?.statusMessage ??
      tool.failureMessage ??
      getToolFailureMessage(undefined, output);
    const toolCallApproval = this.toolCallApprovals.get(toolCallId);
    const executionTimes = this.toolExecutionTimes.get(toolCallId);
    const rawStartTime = executionTimes?.startTime ?? tool.startTime;
    const endTime =
      toolCallApproval === "rejected"
        ? rawStartTime
        : (executionTimes?.endTime ?? new Date());
    // Keep causal order: tool execution cannot start before the generation that
    // requested it finished (or the last known generation end).
    const startTime =
      this.lastLlmGenerationEndTime &&
      rawStartTime.getTime() < this.lastLlmGenerationEndTime.getTime()
        ? this.lastLlmGenerationEndTime
        : rawStartTime;
    const body: ObservationBody = {
      id: toolCallId,
      traceId: this.traceId,
      parentObservationId: this.rootObservationId,
      name: tool.name,
      startTime: startTime.getTime() > endTime.getTime() ? endTime : startTime,
      endTime,
      completionStartTime:
        startTime.getTime() > endTime.getTime() ? endTime : startTime,
      input,
      output,
      ...(failureMessage
        ? { level: "ERROR", statusMessage: failureMessage }
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
    this.toolExecutionTimes.delete(toolCallId);

    this.enqueueObservation("tool-create", body);
  }

  private emitRootAgentObservation(params: {
    metadata: Record<string, unknown>;
    level?: "ERROR";
    statusMessage?: string;
  }) {
    this.enqueueObservation("agent-create", {
      id: this.rootObservationId,
      traceId: this.traceId,
      name: IN_APP_AGENT_TURN_NAME,
      startTime: this.traceStartTime,
      endTime: new Date(),
      input: this.getTraceInput(),
      output: this.getAgentRunOutput(),
      metadata: params.metadata,
      ...(this.prompt
        ? {
            promptName: this.prompt.name,
            promptVersion: this.prompt.version,
          }
        : {}),
      ...(params.level ? { level: params.level } : {}),
      ...(params.statusMessage ? { statusMessage: params.statusMessage } : {}),
    });
  }

  private emitLlmGeneration(
    step: OpenLlmStep,
    event: unknown,
    options?: {
      level?: "ERROR";
      statusMessage?: string;
    },
  ) {
    const eventRecord = isRecord(event) ? event : undefined;
    const providerFinish = step.providerFinish;
    const usageDetails =
      getStepUsageDetails(eventRecord?.usage) ??
      getStepUsageDetails(providerFinish?.usage);
    const finishReason =
      getStepFinishReason(eventRecord) ?? getStepFinishReason(providerFinish);
    const model =
      getModelIdFromStepEvent(eventRecord) ?? this.model ?? undefined;
    // Mastra can delay onStepFinish until after requested tools execute. The
    // raw provider finish is the actual model boundary and keeps the following
    // tool's execute() window intact instead of clamping it to zero duration.
    const endTime = step.providerFinishTime ?? new Date();
    this.lastLlmGenerationEndTime = endTime;
    const id = getInAppAgentLlmCallObservationId(this.runId, step.stepNumber);

    this.enqueueObservation("generation-create", {
      id,
      traceId: this.traceId,
      parentObservationId: this.rootObservationId,
      name: IN_APP_AGENT_LLM_CALL_NAME,
      startTime: step.startTime,
      endTime,
      completionStartTime: step.completionStartTime ?? step.startTime,
      input: this.getLlmStepInput(step.inputMessageCount),
      output: this.getLlmStepOutput(step, eventRecord),
      // Model only travels with usage so Langfuse does not invent tokenizer-
      // estimated costs for generations that never reported tokens.
      ...(usageDetails
        ? {
            usageDetails,
            ...(model ? { model } : {}),
          }
        : {}),
      ...(options?.level ? { level: options.level } : {}),
      ...(options?.statusMessage
        ? { statusMessage: options.statusMessage }
        : {}),
      metadata: {
        ...(finishReason ? { finish_reason: finishReason } : {}),
        ...(options?.statusMessage ? { error: options.statusMessage } : {}),
      },
    });
  }

  private getLlmStepInput(inputMessageCount: number) {
    const base = isRecord(this.agentRunInput) ? this.agentRunInput : {};
    const baseMessages = Array.isArray(base.messages) ? base.messages : [];

    return {
      ...base,
      messages: [
        ...baseMessages,
        ...this.agentRunOutputMessages.slice(0, inputMessageCount),
      ],
    };
  }

  private getTraceInput() {
    if (!this.approvalContinuation || !isRecord(this.agentRunInput)) {
      return this.agentRunInput;
    }

    const messages = Array.isArray(this.agentRunInput.messages)
      ? this.agentRunInput.messages.filter((message) => {
          if (!isRecord(message)) {
            return false;
          }

          return (
            message.role === "developer" ||
            message.role === "system" ||
            message.role === "user"
          );
        })
      : [];

    return {
      ...this.agentRunInput,
      messages,
    };
  }

  private getLlmStepOutput(
    step: OpenLlmStep,
    event: Record<string, unknown> | undefined,
  ) {
    const text = typeof event?.text === "string" ? event.text : undefined;
    const toolCalls = Array.isArray(event?.toolCalls)
      ? event.toolCalls
      : undefined;
    if (text !== undefined || toolCalls?.length) {
      return {
        ...(text !== undefined ? { text } : {}),
        ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
      };
    }

    const response = isRecord(event?.response) ? event.response : undefined;
    if (Array.isArray(response?.messages) && response.messages.length > 0) {
      return { messages: response.messages };
    }

    const messages = this.agentRunOutputMessages.slice(step.inputMessageCount);
    return messages.length > 0 ? { messages } : undefined;
  }

  private endOpenLlmStep(
    metadata?: Record<string, unknown>,
    statusMessage?: string,
  ) {
    if (!this.openLlmStep) {
      return;
    }

    this.emitLlmGeneration(this.openLlmStep, undefined, {
      ...(!this.openLlmStep.providerFinish && (statusMessage || metadata)
        ? {
            level: "ERROR" as const,
            statusMessage:
              statusMessage ??
              (typeof metadata?.error === "string"
                ? metadata.error
                : "LLM step closed before step finish"),
          }
        : {}),
    });
    this.openLlmStep = undefined;
    this.flushDeferredToolCompletions();
  }

  private endOpenToolSpans(
    metadata?: Record<string, unknown>,
    statusMessage?: string,
  ) {
    // Approval interrupts complete the stream without a tool result. Drop those
    // incomplete spans — the generation already records the tool_call request,
    // and the continuation run emits the real tool observation after approval.
    const forceClose =
      Boolean(statusMessage) ||
      Boolean(metadata?.aborted) ||
      Boolean(metadata?.error);

    for (const [toolCallId, tool] of this.toolSpans.entries()) {
      if (tool.output === undefined && !forceClose) {
        this.toolSpans.delete(toolCallId);
        this.toolExecutionTimes.delete(toolCallId);
        continue;
      }

      this.createToolObservation(toolCallId, tool, {
        metadata,
        statusMessage,
      });
      this.toolSpans.delete(toolCallId);
    }

    // endOpenLlmStep() has already drained completed tools before this method
    // runs; keep the unconditional flush to preserve that lifecycle invariant.
    this.flushDeferredToolCompletions();
  }

  private ensureOpenLlmStep(now: Date) {
    if (this.openLlmStep) {
      return;
    }

    this.openLlmStep = {
      stepNumber: ++this.nextStepNumber,
      startTime: now,
      inputMessageCount: this.agentRunOutputMessages.length,
    };
  }

  private flushDeferredToolCompletions() {
    if (this.deferredToolCompletions.size === 0) {
      return;
    }

    const deferred = [...this.deferredToolCompletions.entries()];
    this.deferredToolCompletions.clear();
    for (const [toolCallId, tool] of deferred) {
      this.createToolObservation(toolCallId, tool);
    }
  }

  private enqueueObservation(type: string, body: ObservationBody) {
    (
      this.langfuse as unknown as {
        enqueue: (type: string, body: ObservationBody) => void;
      }
    ).enqueue(type, body);
  }

  // Reasoning that no assistant message followed (e.g. aborted or errored
  // turns) still gets recorded as its own thinking-only assistant message.
  private flushTrailingThinking() {
    const thinking = this.takePendingThinking();
    if (!thinking) {
      return;
    }

    this.agentRunOutputMessages.push({
      role: "assistant",
      content: "",
      thinking,
    });
  }

  private flushCurrentReasoning() {
    if (!this.currentReasoning) {
      return;
    }

    this.pendingThinking.push({
      type: "thinking",
      content: this.currentReasoning,
    });
    this.currentReasoning = "";
  }

  // Reasoning always precedes the assistant action it produced, so pending
  // thinking parts attach to the next assistant output message.
  private takePendingThinking(): AgentRunThinkingPart[] | undefined {
    this.flushCurrentReasoning();

    if (this.pendingThinking.length === 0) {
      return undefined;
    }

    return this.pendingThinking.splice(0);
  }

  private recordAssistantText(delta: string) {
    this.output += delta;

    const thinking = this.takePendingThinking();
    const lastMessage = this.agentRunOutputMessages.at(-1);
    if (
      !thinking &&
      lastMessage?.role === "assistant" &&
      !lastMessage.tool_calls?.length
    ) {
      lastMessage.content = `${typeof lastMessage.content === "string" ? lastMessage.content : ""}${delta}`;
      return;
    }

    this.agentRunOutputMessages.push({
      role: "assistant",
      content: delta,
      ...(thinking ? { thinking } : {}),
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
    const toolCall: AgentRunToolCall = {
      id: toolCallId,
      name: tool.name,
      arguments: tool.args || "{}",
      type: "function",
    };

    const thinking = this.takePendingThinking();
    this.agentRunToolCalls.push(toolCall);
    this.agentRunOutputMessages.push({
      role: "assistant",
      content: "",
      ...(thinking ? { thinking } : {}),
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
    const priorMessages =
      this.approvalContinuation && isRecord(this.agentRunInput)
        ? getPriorAgentRunOutputMessages(this.agentRunInput.messages)
        : [];
    const messages = [...priorMessages, ...this.agentRunOutputMessages];

    if (messages.length === 0) {
      return undefined;
    }

    const priorToolCalls = priorMessages.flatMap(
      (message) => message.tool_calls ?? [],
    );
    const toolCalls = [...priorToolCalls, ...this.agentRunToolCalls];

    return {
      messages,
      ...(this.output ? { text: this.output } : {}),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    };
  }

  private emitApprovalWaitObservation() {
    const continuation = this.approvalContinuation;
    if (!continuation) {
      return;
    }

    const requestedAt =
      continuation.approvalRequestedAt ??
      continuation.approvalDecidedAt ??
      this.agentRunStartTime;
    const decidedAt = continuation.approvalDecidedAt ?? this.agentRunStartTime;
    const endTime =
      decidedAt.getTime() < requestedAt.getTime() ? requestedAt : decidedAt;

    this.enqueueObservation("span-create", {
      id: `${this.runId}-approval-wait`,
      traceId: this.traceId,
      parentObservationId: this.rootObservationId,
      name: `waiting for user approval for tool ${continuation.toolName}`,
      startTime: requestedAt,
      endTime,
      input: {
        tool_call_id: continuation.toolCallId,
        tool_name: continuation.toolName,
      },
      output: `User ${continuation.status} tool ${continuation.toolName}`,
      metadata: continuation.metadata,
    });
  }
}

function getApprovalContinuation(
  input: AgUiRunAgentInput,
): ApprovalContinuation | undefined {
  const forwardedProps = ResumeForwardedPropsSchema.safeParse(
    input.forwardedProps,
  );

  if (!forwardedProps.success) {
    return undefined;
  }

  const {
    approved,
    approvalRequest,
    continuationNumber = 1,
    rootRunId = approvalRequest.runId,
    traceStartedAt,
    approvalRequestedAt,
    approvalDecidedAt,
  } = forwardedProps.data.command.resume;
  const status = approved ? "approved" : "rejected";

  return {
    status,
    continuationNumber,
    rootRunId,
    toolCallId: approvalRequest.toolCallId,
    toolName: approvalRequest.toolName,
    ...(traceStartedAt ? { traceStartedAt: new Date(traceStartedAt) } : {}),
    ...(approvalRequestedAt
      ? { approvalRequestedAt: new Date(approvalRequestedAt) }
      : {}),
    ...(approvalDecidedAt
      ? { approvalDecidedAt: new Date(approvalDecidedAt) }
      : {}),
    metadata: {
      continuation_type: "tool_approval",
      continuation_number: continuationNumber,
      parent_run_id: approvalRequest.runId,
      approval_status: status,
      approval_tool_call_id: approvalRequest.toolCallId,
      approval_tool_name: approvalRequest.toolName,
      ...(approvalRequestedAt
        ? { approval_requested_at: approvalRequestedAt }
        : {}),
      ...(approvalDecidedAt ? { approval_decided_at: approvalDecidedAt } : {}),
    },
  };
}

function getPriorAgentRunOutputMessages(
  messages: unknown,
): AgentRunChatMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.filter(
    (message): message is AgentRunChatMessage =>
      isRecord(message) &&
      (message.role === "assistant" || message.role === "tool"),
  );
}

function getAgentRunInput(input: AgUiRunAgentInput): unknown {
  const messages = getAgentRunMessages(getCurrentTurnMessages(input.messages));
  const context = getAgentRunContext(input);

  if (!context) {
    return { messages };
  }

  return {
    messages,
    context,
  };
}

function getCurrentTurnMessages(messages: AgUiMessage[]): AgUiMessage[] {
  const lastUserMessageIndex = messages.findLastIndex(
    (message) => message.role === "user",
  );

  if (lastUserMessageIndex === -1) {
    return messages;
  }

  return messages.filter(
    (message, index) =>
      message.role === "developer" ||
      message.role === "system" ||
      index >= lastUserMessageIndex,
  );
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
    if (message.role === "developer" || message.role === "system") {
      return [
        {
          role: message.role,
          ...(message.name ? { name: message.name } : {}),
          content: message.content,
        },
      ];
    }

    if (message.role === "user") {
      return [
        {
          role: "user",
          ...(message.name ? { name: message.name } : {}),
          content: normalizeUserMessageContent(message.content),
        },
      ];
    }

    if (message.role === "assistant") {
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

    if (message.role === "tool") {
      return [
        {
          role: "tool",
          tool_call_id: message.toolCallId,
          content: parseJsonOrString(message.content),
        },
      ];
    }

    if (message.role === "activity" || message.role === "reasoning") {
      return [];
    }

    return assertUnreachable(message);
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

function getFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getStepUsageDetails(
  usage: unknown,
): Record<string, number> | undefined {
  if (!isRecord(usage)) {
    return undefined;
  }

  const nestedInputTokens = isRecord(usage.inputTokens)
    ? usage.inputTokens
    : undefined;
  const nestedOutputTokens = isRecord(usage.outputTokens)
    ? usage.outputTokens
    : undefined;
  const inputTokens =
    getFiniteNumber(usage.inputTokens) ??
    getFiniteNumber(nestedInputTokens?.total);
  const outputTokens =
    getFiniteNumber(usage.outputTokens) ??
    getFiniteNumber(nestedOutputTokens?.total);
  if (inputTokens === undefined && outputTokens === undefined) {
    return undefined;
  }

  const cacheReadTokens =
    getFiniteNumber(usage.cachedInputTokens) ??
    getFiniteNumber(nestedInputTokens?.cacheRead) ??
    0;
  const cacheWriteTokens =
    getFiniteNumber(usage.cacheCreationInputTokens) ??
    getFiniteNumber(nestedInputTokens?.cacheWrite) ??
    0;
  const uncachedInputTokens = getFiniteNumber(nestedInputTokens?.noCache);

  // Mastra's inputTokens includes cache reads/writes, while Langfuse model
  // prices bill `input` as non-cached input tokens with separate cache keys.
  return {
    input:
      uncachedInputTokens ??
      Math.max(0, (inputTokens ?? 0) - cacheReadTokens - cacheWriteTokens),
    output: outputTokens ?? 0,
    cache_read_input_tokens: cacheReadTokens,
    cache_creation_input_tokens: cacheWriteTokens,
    total:
      getFiniteNumber(usage.totalTokens) ??
      (inputTokens ?? 0) + (outputTokens ?? 0),
  };
}

function getStepFinishReason(
  event: Record<string, unknown> | undefined,
): string | undefined {
  if (!event) {
    return undefined;
  }

  const finishReason = event.finishReason;
  if (typeof finishReason === "string") {
    return finishReason;
  }

  if (isRecord(finishReason)) {
    return (
      getStringValue(finishReason.unified) ?? getStringValue(finishReason.raw)
    );
  }

  return isRecord(event.stepResult)
    ? getStringValue(event.stepResult.reason)
    : undefined;
}

function getModelIdFromStepEvent(
  event: Record<string, unknown> | undefined,
): string | undefined {
  if (!event) {
    return undefined;
  }

  if (isRecord(event.model)) {
    const modelId = getStringValue(event.model.modelId);
    if (modelId) {
      return modelId;
    }
  }

  if (isRecord(event.response)) {
    return getStringValue(event.response.modelId);
  }

  return undefined;
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

function getStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
