import { EventType } from "@ag-ui/core";
import { getInternalTracingHandler, logger } from "@langfuse/shared/src/server";

import type {
  AgUiEvent,
  AgUiRunAgentInput,
} from "@/src/ee/features/in-app-agent/schema";
import { compactTextMessageChunks } from "@/src/ee/features/in-app-agent/server/eventCompaction";

export type InAppAgentTracingConfig = {
  environment: string;
  metadata: Record<string, unknown>;
  userId: string;
  traceId: string;
  targetProjectId: string;
};

export type InAppAgentInstrumentationParams = {
  input: AgUiRunAgentInput;
  tracing?: InAppAgentTracingConfig;
};

const IN_APP_AGENT_TRACE_NAME = "in-app-agent";
const IN_APP_AGENT_SPAN_NAME = "agent-run";
type InternalTracingHandler = ReturnType<typeof getInternalTracingHandler>;
type InAppAgentTrace = ReturnType<
  InternalTracingHandler["handler"]["langfuse"]["trace"]
>;
type InAppAgentSpan = ReturnType<InAppAgentTrace["span"]>;
type InAppAgentLangfuse = InternalTracingHandler["handler"]["langfuse"];
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
      userId: tracing.userId,
      traceId: tracing.traceId,
      targetProjectId: tracing.targetProjectId,
      environment: tracing.environment,
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
  private readonly span: InAppAgentSpan;
  private readonly toolSpans = new Map<
    string,
    {
      name: string;
      startTime: Date;
      args: string;
      argsComplete: boolean;
      output?: unknown;
    }
  >();
  private readonly metadata: Record<string, unknown>;
  private output = "";
  private reasoning = "";
  private ended = false;

  constructor(params: {
    input: AgUiRunAgentInput;
    metadata: Record<string, unknown>;
    userId: string;
    traceId: string;
    targetProjectId: string;
    environment: string;
  }) {
    this.metadata = params.metadata;

    const { handler, processTracedEvents } = getInternalTracingHandler({
      targetProjectId: params.targetProjectId,
      traceId: params.traceId,
      traceName: IN_APP_AGENT_TRACE_NAME,
      environment: params.environment,
      userId: params.userId,
      metadata: params.metadata,
    });
    this.processTracedEvents = processTracedEvents;
    this.langfuse = handler.langfuse;

    this.trace = this.langfuse.trace({
      id: params.traceId,
      name: IN_APP_AGENT_TRACE_NAME,
      userId: params.userId,
      sessionId: params.input.threadId,
      metadata: params.metadata,
      tags: ["in-app-agent"],
    });
    this.span = this.trace.span({
      name: IN_APP_AGENT_SPAN_NAME,
      input: getAgentSpanInput(params.input),
      metadata: params.metadata,
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

  endWithError(error: unknown) {
    if (this.ended) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.endOpenToolSpans({ error: message }, message);
    this.span.update({
      output: this.output || undefined,
      level: "ERROR",
      statusMessage: message,
      metadata: {
        ...this.metadata,
        ...(this.reasoning ? { reasoning: this.reasoning } : {}),
        error: message,
      },
    });
    this.trace.update({
      metadata: { ...this.metadata, error: message },
    });
    this.span.end();
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
    this.span.update({
      output: this.output || undefined,
      metadata,
    });
    this.trace.update({ metadata });
    this.span.end();
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
          this.output += event.delta;
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
      output?: unknown;
    },
    options?: {
      metadata?: Record<string, unknown>;
      statusMessage?: string;
    },
  ) {
    const body: ToolObservationBody = {
      id: toolCallId,
      traceId: this.span.traceId,
      parentObservationId: this.span.observationId,
      name: tool.name,
      startTime: tool.startTime,
      endTime: new Date(),
      completionStartTime: tool.startTime,
      input: parseJsonOrString(tool.args),
      output: tool.output,
      ...(options?.statusMessage
        ? { level: "ERROR", statusMessage: options.statusMessage }
        : {}),
      metadata: {
        ...(options?.metadata ?? {}),
        toolCallId,
      },
    };

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
}

function getAgentSpanInput(input: AgUiRunAgentInput): unknown {
  const message = getLastUserMessageText(input);

  if (input.context.length === 0) {
    return message;
  }

  return {
    message,
    context: input.context,
  };
}

function getLastUserMessageText(input: AgUiRunAgentInput): string | undefined {
  const lastMessage = input.messages.at(-1);

  if (lastMessage?.role !== "user") {
    return undefined;
  }

  if (typeof lastMessage.content === "string") {
    return lastMessage.content;
  }

  return lastMessage.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
}

function parseJsonOrString(value: string): unknown {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
