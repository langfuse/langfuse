import { EventType } from "@ag-ui/core";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
  LangfuseOtelSpanAttributes,
  setLangfuseTracerProvider,
  startObservation,
  type LangfuseAgent,
  type LangfuseTool,
} from "@langfuse/tracing";
import { TraceFlags, type TracerProvider } from "@opentelemetry/api";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";

import type {
  AgUiEvent,
  AgUiRunAgentInput,
} from "@/src/features/in-app-agent/schema";
import { assertUnreachable } from "@/src/utils/types";
import { logger } from "@langfuse/shared/src/server";

export type InAppAgentTracingConfig = {
  publicKey?: string;
  secretKey?: string;
  host?: string;
  environment: string;
  metadata: Record<string, unknown>;
  userId: string;
  traceId: string;
};

export type InAppAgentInstrumentationParams = {
  input: AgUiRunAgentInput;
  tracing?: InAppAgentTracingConfig;
};

type LangfuseTracerProvider = TracerProvider & { forceFlush(): Promise<void> };

const IN_APP_AGENT_TRACE_NAME = "in-app-agent";
const IN_APP_AGENT_SPAN_NAME = "agent-run";
const INSTRUMENTED_EVENT_TYPES = [
  EventType.TEXT_MESSAGE_CONTENT,
  EventType.TOOL_CALL_START,
  EventType.TOOL_CALL_ARGS,
  EventType.TOOL_CALL_RESULT,
  EventType.TOOL_CALL_END,
  EventType.RUN_ERROR,
  EventType.RUN_FINISHED,
] as const;

type InstrumentedAgUiEventType = Extract<
  AgUiEvent["type"],
  (typeof INSTRUMENTED_EVENT_TYPES)[number]
>;
type InstrumentedAgUiEvent = AgUiEvent & { type: InstrumentedAgUiEventType };

const langfuseTracerProviders = new Map<string, LangfuseTracerProvider>();

export function getInAppAgentTracingEnvironment(
  cloudRegion: string | undefined,
): string {
  switch (cloudRegion) {
    case "US":
    case "EU":
    case "HIPAA":
    case "JP":
      return "prod";
    case "STAGING":
      return "staging";
    default:
      return "dev";
  }
}

export function createInAppAgentInstrumentation({
  input,
  tracing,
}: InAppAgentInstrumentationParams) {
  if (!tracing?.publicKey || !tracing.secretKey) {
    return undefined;
  }

  try {
    return new InAppAgentInstrumentation({
      input,
      tracerProvider: getLangfuseTracerProvider(tracing),
      metadata: tracing.metadata,
      userId: tracing.userId,
      traceId: tracing.traceId,
    });
  } catch (error) {
    logger.warn("Failed to initialize in-app agent Langfuse tracing", error);
    return undefined;
  }
}

export class InAppAgentInstrumentation {
  private readonly tracerProvider: LangfuseTracerProvider;
  private readonly span: LangfuseAgent;
  private readonly toolSpans = new Map<
    string,
    {
      span: LangfuseTool;
      name?: string;
      args: string;
      argsComplete: boolean;
      output?: unknown;
    }
  >();
  private readonly metadata: Record<string, unknown>;
  private output = "";
  private ended = false;

  constructor(params: {
    tracerProvider: LangfuseTracerProvider;
    input: AgUiRunAgentInput;
    metadata: Record<string, unknown>;
    userId: string;
    traceId: string;
  }) {
    this.tracerProvider = params.tracerProvider;
    this.metadata = params.metadata;
    setLangfuseTracerProvider(this.tracerProvider);

    this.span = startObservation(
      IN_APP_AGENT_SPAN_NAME,
      {
        input: getLastUserMessageText(params.input),
        metadata: params.metadata,
      },
      {
        asType: "agent",
        parentSpanContext: {
          traceId: params.traceId,
          spanId: "0000000000000001",
          traceFlags: TraceFlags.SAMPLED,
        },
      },
    );
    this.span.otelSpan.setAttributes({
      [LangfuseOtelSpanAttributes.TRACE_NAME]: IN_APP_AGENT_TRACE_NAME,
      [LangfuseOtelSpanAttributes.TRACE_USER_ID]: params.userId,
      [LangfuseOtelSpanAttributes.TRACE_SESSION_ID]: params.input.threadId,
      [LangfuseOtelSpanAttributes.TRACE_TAGS]: ["in-app-agent"],
      [LangfuseOtelSpanAttributes.TRACE_INPUT]: getLastUserMessageText(
        params.input,
      ),
      [LangfuseOtelSpanAttributes.AS_ROOT]: true,
      ...getTraceMetadataAttributes(params.metadata),
    });
  }

  recordEvents(events: AgUiEvent[]) {
    for (const event of events) {
      if (shouldInstrumentAgUiEvent(event)) {
        this.recordEvent(event);
      }
    }
  }

  endWithError(error: unknown) {
    if (this.ended) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.endOpenToolSpans({ error: message });
    this.span.update({
      output: this.output || undefined,
      metadata: {
        ...this.metadata,
        error: message,
      },
    });
    this.span.otelSpan.setAttributes({
      [LangfuseOtelSpanAttributes.TRACE_OUTPUT]: this.output || undefined,
      ...getTraceMetadataAttributes({ ...this.metadata, error: message }),
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
      ...(params?.aborted ? { aborted: true } : {}),
      ...(params?.result ? { result: params.result } : {}),
    };
    this.span.update({
      output: this.output || undefined,
      metadata,
    });
    this.span.otelSpan.setAttributes({
      [LangfuseOtelSpanAttributes.TRACE_OUTPUT]: this.output || undefined,
      ...getTraceMetadataAttributes(metadata),
    });
    this.span.end();
    this.ended = true;
  }

  flush() {
    void this.tracerProvider.forceFlush().catch((error) => {
      logger.warn("Failed to flush in-app agent Langfuse tracing", error);
    });
  }

  private recordEvent(event: InstrumentedAgUiEvent) {
    switch (event.type) {
      case EventType.TEXT_MESSAGE_CONTENT:
        if (typeof event.delta === "string") {
          this.output += event.delta;
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
      default:
        assertUnreachable(event.type);
    }
  }

  private startToolSpan(event: AgUiEvent) {
    if (typeof event.toolCallId !== "string") {
      return;
    }

    const name =
      typeof event.toolCallName === "string" ? event.toolCallName : "tool-call";
    this.toolSpans.set(event.toolCallId, {
      span: this.span.startObservation(
        `tool:${name}`,
        {
          input: undefined,
        },
        { asType: "tool" },
      ),
      name,
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
      span: LangfuseTool;
      args: string;
      argsComplete: boolean;
      output?: unknown;
    },
  ) {
    if (!tool.argsComplete || tool.output === undefined) {
      return;
    }

    tool.span.update({
      input: parseJsonOrString(tool.args),
      output: tool.output,
    });
    tool.span.end();
    this.toolSpans.delete(toolCallId);
  }

  private endOpenToolSpans(metadata?: Record<string, unknown>) {
    for (const [toolCallId, tool] of this.toolSpans.entries()) {
      tool.span.update({
        input: parseJsonOrString(tool.args),
        output: tool.output,
        metadata: metadata ? { ...metadata, toolCallId } : { toolCallId },
      });
      tool.span.end();
      this.toolSpans.delete(toolCallId);
    }
  }
}

function getLangfuseTracerProvider(
  config: InAppAgentTracingConfig,
): LangfuseTracerProvider {
  const cacheKey = JSON.stringify({
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    host: config.host,
    environment: config.environment,
  });
  const cachedProvider = langfuseTracerProviders.get(cacheKey);

  if (cachedProvider) {
    return cachedProvider;
  }

  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: config.publicKey,
        secretKey: config.secretKey,
        baseUrl: config.host,
        environment: config.environment,
        ...(config.environment === "dev"
          ? { exportMode: "immediate" as const }
          : {}),
      }),
    ],
  });
  langfuseTracerProviders.set(cacheKey, tracerProvider);
  return tracerProvider;
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

function shouldInstrumentAgUiEvent(
  event: AgUiEvent,
): event is InstrumentedAgUiEvent {
  return INSTRUMENTED_EVENT_TYPES.some((type) => type === event.type);
}

function getTraceMetadataAttributes(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) => {
      const serialized =
        typeof value === "string" ? value : JSON.stringify(value);
      return serialized
        ? [[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.${key}`, serialized]]
        : [];
    }),
  );
}
