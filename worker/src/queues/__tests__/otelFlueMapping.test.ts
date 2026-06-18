/**
 * Tests for mapping Flue (https://flueframework.com) OpenTelemetry spans to the
 * Langfuse data model.
 *
 * Flue's @flue/opentelemetry adapter converts its observe() event stream into
 * OTel spans. Model-turn spans use the GenAI semantic conventions; workflow,
 * operation, tool and delegated-task spans carry flue.* attributes only. This
 * suite verifies observation types and input/output extraction for each.
 *
 * Flow tested: ResourceSpan -> OtelIngestionProcessor.processToEvent()
 */
import { describe, it, expect } from "vitest";
import { OtelIngestionProcessor } from "@langfuse/shared/src/server";

const FLUE_SCOPE = "@flue/opentelemetry";

function createNanoTimestamp(nanoTime: bigint): {
  low: number;
  high: number;
  unsigned: boolean;
} {
  const low = Number(nanoTime & BigInt(0xffffffff));
  const high = Number(nanoTime >> BigInt(32));
  return { low, high, unsigned: true };
}

function createBufferId(hexString: string): { type: "Buffer"; data: number[] } {
  const buffer = Buffer.from(hexString, "hex");
  return { type: "Buffer", data: Array.from(buffer) };
}

type Attr = { key: string; value: { stringValue: string } };

function attrs(record: Record<string, string>): Attr[] {
  return Object.entries(record).map(([key, value]) => ({
    key,
    value: { stringValue: value },
  }));
}

/**
 * Build a single-span ResourceSpan under the Flue instrumentation scope and
 * return the processed event for that span.
 */
function processFlueSpan(params: {
  name: string;
  attributes: Record<string, string>;
}): any {
  const resourceSpan = {
    resource: {
      attributes: attrs({ "service.name": "flue-app" }),
    },
    scopeSpans: [
      {
        scope: { name: FLUE_SCOPE, version: "1.0.0-beta.1", attributes: [] },
        spans: [
          {
            traceId: createBufferId("a11bbc4370b42e3646f4fb2e9ff33b53"),
            spanId: createBufferId("57f0255417974100"),
            name: params.name,
            kind: 1,
            startTimeUnixNano: createNanoTimestamp(BigInt(1714488530686000000)),
            endTimeUnixNano: createNanoTimestamp(BigInt(1714488530687000000)),
            attributes: attrs(params.attributes),
          },
        ],
      },
    ],
  };

  const processor = new OtelIngestionProcessor({ projectId: "test-project" });
  const events = processor.processToEvent([resourceSpan]);
  expect(events).toHaveLength(1);
  return events[0];
}

describe("Flue OTel span mapping", () => {
  it("maps a model-turn span to a GENERATION with flue.turn.input/output", () => {
    const event = processFlueSpan({
      name: "chat gpt-4o-mini",
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.request.model": "gpt-4o-mini",
        "gen_ai.provider.name": "openai",
        "flue.turn.input": JSON.stringify({
          systemPrompt: "You are a helpful assistant.",
          messages: [{ role: "user", content: "Weather in Berlin?" }],
        }),
        "flue.turn.output": JSON.stringify({
          role: "assistant",
          content: [{ type: "text", text: "Berlin: sunny, 72 F" }],
        }),
      },
    });

    expect(event.type).toBe("GENERATION");
    expect(event.input).toEqual({
      systemPrompt: "You are a helpful assistant.",
      messages: [{ role: "user", content: "Weather in Berlin?" }],
    });
    expect(event.output).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "Berlin: sunny, 72 F" }],
    });
    // content attributes should not be duplicated into metadata
    expect(event.metadata?.attributes?.["flue.turn.input"]).toBeUndefined();
    expect(event.metadata?.attributes?.["flue.turn.output"]).toBeUndefined();
  });

  it("maps a tool span to a TOOL observation with flue.tool.arguments/result", () => {
    const event = processFlueSpan({
      name: "flue.tool lookup_weather",
      attributes: {
        "flue.tool.name": "lookup_weather",
        "flue.tool.call_id": "call_eMtDs10B2Ijsp2DawyuUeE0r",
        "flue.tool.arguments": JSON.stringify({ city: "Berlin" }),
        "flue.tool.result": JSON.stringify({
          content: [{ type: "text", text: "Berlin: sunny, 72 F" }],
        }),
      },
    });

    expect(event.type).toBe("TOOL");
    expect(event.input).toEqual({ city: "Berlin" });
    expect(event.output).toEqual({
      content: [{ type: "text", text: "Berlin: sunny, 72 F" }],
    });
    expect(event.metadata?.attributes?.["flue.tool.arguments"]).toBeUndefined();
    expect(event.metadata?.attributes?.["flue.tool.result"]).toBeUndefined();
  });

  it("maps a delegated-task span to an AGENT observation with prompt/result", () => {
    const event = processFlueSpan({
      name: "flue.task summarizer",
      attributes: {
        "flue.task.id": "task_01",
        "flue.task.agent": "summarizer",
        "flue.task.prompt": "Summarize the meeting notes.",
        "flue.task.result": "The team shipped the integration.",
      },
    });

    expect(event.type).toBe("AGENT");
    expect(event.input).toBe("Summarize the meeting notes.");
    expect(event.output).toBe("The team shipped the integration.");
  });

  it("maps a workflow span to a SPAN with payload/result", () => {
    const event = processFlueSpan({
      name: "flue.workflow tools",
      attributes: {
        "flue.workflow.name": "tools",
        "flue.workflow.payload": JSON.stringify({ city: "Berlin" }),
        "flue.workflow.result": JSON.stringify({
          message: "The current weather in Berlin is sunny.",
        }),
      },
    });

    expect(event.type).toBe("SPAN");
    expect(event.input).toEqual({ city: "Berlin" });
    expect(event.output).toEqual({
      message: "The current weather in Berlin is sunny.",
    });
  });

  it("maps an operation span to a SPAN with result as output and no input", () => {
    const event = processFlueSpan({
      name: "flue.operation prompt",
      attributes: {
        "flue.operation.id": "op_01",
        "flue.operation.kind": "prompt",
        "flue.operation.result": JSON.stringify({ text: "done" }),
      },
    });

    expect(event.type).toBe("SPAN");
    expect(event.input).toBeNull();
    expect(event.output).toEqual({ text: "done" });
  });
});
