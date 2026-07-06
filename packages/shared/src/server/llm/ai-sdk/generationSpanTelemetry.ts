import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import type { Telemetry } from "ai";

/**
 * Minimal AI SDK telemetry integration for Langfuse-internal LLM completions.
 *
 * Emits exactly ONE GenAI-semconv generation span per language-model call,
 * parented to the active context (the internal root span). This replaces
 * `@ai-sdk/otel`'s hardcoded operation → step → model-call span cascade,
 * which tripled the span count per completion and set `gen_ai.usage.*` on
 * both the operation and the model-call span — double-costing every internal
 * trace once the OTel ingestion pipeline classified both as generations.
 *
 * Only `onLanguageModelCallStart`/`onLanguageModelCallEnd` are handled: the
 * start event carries model, provider, call settings, messages, and tool
 * definitions; the end event carries content, finish reason, and usage.
 * Client-side tool execution and multi-step loops are not instrumented — the
 * internal executor never passes tool `execute` functions, so every
 * completion is a single model call (plus SDK-internal retries, which reuse
 * the call id sequentially and therefore each get their own span).
 */
export function createGenerationSpanTelemetry(params: {
  tracer: Tracer;
  /**
   * Extra attributes for every generation span (Langfuse prompt link,
   * experiment linkage).
   */
  attributes?: Attributes;
}): Telemetry {
  const { tracer, attributes } = params;
  const openSpans = new Map<string, Span>();

  const endAllOpenSpans = (error?: unknown): void => {
    for (const span of openSpans.values()) {
      if (error !== undefined) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof Error) span.recordException(error);
      }
      span.end();
    }
    openSpans.clear();
  };

  return {
    onLanguageModelCallStart(event) {
      // Defensive: a lingering span for this call id means its end event never
      // fired (e.g. a retried attempt) — close it before starting the next.
      openSpans.get(event.callId)?.end();

      const span = tracer.startSpan(
        `chat ${event.modelId}`,
        {
          kind: SpanKind.CLIENT,
          attributes: {
            "gen_ai.operation.name": "chat",
            "gen_ai.provider.name": event.provider,
            "gen_ai.request.model": event.modelId,
            ...definedNumberAttributes({
              "gen_ai.request.max_tokens": event.maxOutputTokens,
              "gen_ai.request.temperature": event.temperature,
              "gen_ai.request.top_p": event.topP,
            }),
            ...(event.messages !== undefined
              ? { "gen_ai.input.messages": safeJsonStringify(event.messages) }
              : {}),
            ...(event.tools && event.tools.length > 0
              ? { "gen_ai.tool.definitions": safeJsonStringify(event.tools) }
              : {}),
            ...attributes,
          },
        },
        context.active(),
      );

      openSpans.set(event.callId, span);
    },

    onLanguageModelCallEnd(event) {
      const span = openSpans.get(event.callId);
      if (!span) return;
      openSpans.delete(event.callId);

      span.setAttributes({
        "gen_ai.response.finish_reasons": [event.finishReason],
        ...(event.responseId ? { "gen_ai.response.id": event.responseId } : {}),
        ...definedNumberAttributes({
          "gen_ai.usage.input_tokens": event.usage.inputTokens,
          "gen_ai.usage.output_tokens": event.usage.outputTokens,
          "gen_ai.usage.cache_read.input_tokens":
            event.usage.inputTokenDetails?.cacheReadTokens,
          "gen_ai.usage.cache_creation.input_tokens":
            event.usage.inputTokenDetails?.cacheWriteTokens,
        }),
        "gen_ai.output.messages": safeJsonStringify([
          { role: "assistant", content: event.content },
        ]),
      });
      span.end();
    },

    onError(error) {
      endAllOpenSpans(error);
    },

    onAbort() {
      endAllOpenSpans();
    },

    // Run the provider call with the generation span active, so any future
    // nested instrumentation parents correctly.
    executeLanguageModelCall({ callId, execute }) {
      const span = openSpans.get(callId);
      if (!span) return execute();
      return context.with(trace.setSpan(context.active(), span), execute);
    },
  };
}

function definedNumberAttributes(
  attributes: Record<string, number | undefined>,
): Attributes {
  return Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== undefined),
  ) as Attributes;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[Unserializable content]";
  }
}
