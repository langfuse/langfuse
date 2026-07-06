/**
 * Tests for OtelIngestionProcessor handling of Vercel AI SDK (@ai-sdk/otel)
 * agent spans.
 *
 * The AI SDK's official OTel integration emits a span cascade per
 * `generateText` call:
 * - an `invoke_agent <model>` operation span (gen_ai.operation.name:
 *   "invoke_agent") carrying AGGREGATE `gen_ai.usage.*` token counts,
 * - a child step span (gen_ai.operation.name: "agent_step") that can carry
 *   supplemental usage detail attributes,
 * - a grandchild model-call span (gen_ai.operation.name: "chat") carrying the
 *   PER-CALL `gen_ai.usage.*` and `gen_ai.request.model`.
 *
 * If model/usage/cost details are populated on the agent/step spans as well
 * as the chat span, Langfuse costs both and every trace's cost is doubled.
 * These tests assert that model, usage, and cost details are only populated
 * on the model-call span — in BOTH the legacy ingestion-event path and the
 * v4 events path.
 */
import { describe, it, expect } from "vitest";

import { OtelIngestionProcessor } from "./OtelIngestionProcessor";
import type { ResourceSpan } from "./OtelIngestionProcessor";

const createProcessor = () =>
  new OtelIngestionProcessor({
    projectId: "test-project",
    publicKey: "pk-lf-test",
    sdkName: "test-sdk",
    sdkVersion: "1.0.0",
  });

function createBufferId(hexString: string): { type: "Buffer"; data: number[] } {
  const buffer = Buffer.from(hexString, "hex");
  return { type: "Buffer", data: Array.from(buffer) };
}

const str = (key: string, value: string) => ({
  key,
  value: { stringValue: value },
});
const int = (key: string, value: number) => ({
  key,
  value: { intValue: value },
});

const START_TIME_NANO = "1714488530686000000";
const END_TIME_NANO = "1714488530687000000";

function createResourceSpan(params: {
  scopeName: string;
  spanName: string;
  attributes: Array<{ key: string; value: any }>;
}): ResourceSpan {
  return {
    resource: {
      attributes: [str("service.name", "test-service")],
    },
    scopeSpans: [
      {
        scope: { name: params.scopeName, version: "1.0.0" },
        spans: [
          {
            traceId: createBufferId("2cce18f7e8cd065a0b4e634eef728391"),
            spanId: createBufferId("57f0255417974100"),
            name: params.spanName,
            kind: 1,
            startTimeUnixNano: START_TIME_NANO,
            endTimeUnixNano: END_TIME_NANO,
            attributes: params.attributes,
          } as any,
        ],
      },
    ],
  };
}

const AI_SDK_SCOPE = "gen_ai"; // @ai-sdk/otel uses `getTracer("gen_ai")`

const aiSdkInvokeAgentSpan = createResourceSpan({
  scopeName: AI_SDK_SCOPE,
  spanName: "invoke_agent gpt-4o-mini",
  attributes: [
    str("gen_ai.operation.name", "invoke_agent"),
    str("gen_ai.provider.name", "openai"),
    str("gen_ai.request.model", "gpt-4o-mini"),
    // Aggregate usage across all steps — duplicates the child chat span usage
    int("gen_ai.usage.input_tokens", 100),
    int("gen_ai.usage.output_tokens", 50),
    int("gen_ai.usage.cache_read.input_tokens", 10),
    int("gen_ai.usage.cache_creation.input_tokens", 5),
    str("gen_ai.input.messages", '[{"role":"user","parts":[]}]'),
    str("gen_ai.output.messages", '[{"role":"assistant","parts":[]}]'),
  ],
});

const aiSdkAgentStepSpan = createResourceSpan({
  scopeName: AI_SDK_SCOPE,
  spanName: "agent_step",
  attributes: [
    str("gen_ai.operation.name", "agent_step"),
    str("gen_ai.provider.name", "openai"),
    // Supplemental usage detail attributes on the step span
    int("gen_ai.usage.input_tokens", 100),
    int("gen_ai.usage.output_tokens", 50),
    int("gen_ai.usage.cache_read.input_tokens", 10),
  ],
});

const aiSdkChatSpan = createResourceSpan({
  scopeName: AI_SDK_SCOPE,
  spanName: "chat gpt-4o-mini",
  attributes: [
    str("gen_ai.operation.name", "chat"),
    str("gen_ai.provider.name", "openai"),
    str("gen_ai.request.model", "gpt-4o-mini"),
    // Per-call usage — this is the span that must be costed
    int("gen_ai.usage.input_tokens", 100),
    int("gen_ai.usage.output_tokens", 50),
  ],
});

// A non-AI-SDK agent-type span (OpenInference) that legitimately carries
// usage on an AGENT observation — must remain costed.
const openInferenceAgentSpan = createResourceSpan({
  scopeName: "openinference.instrumentation.custom",
  spanName: "my-agent",
  attributes: [
    str("openinference.span.kind", "AGENT"),
    str("llm.model_name", "gpt-4o-mini"),
    int("gen_ai.usage.input_tokens", 100),
    int("gen_ai.usage.output_tokens", 50),
  ],
});

// An ordinary non-AI-SDK span with generic GenAI usage attributes.
const genericGenAiSpan = createResourceSpan({
  scopeName: "my-custom-instrumentation",
  spanName: "llm-call",
  attributes: [
    str("gen_ai.request.model", "gpt-4o-mini"),
    int("gen_ai.usage.input_tokens", 100),
    int("gen_ai.usage.output_tokens", 50),
  ],
});

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "object" && Object.keys(value as object).length === 0);

describe("OtelIngestionProcessor AI SDK agent span costing", () => {
  describe("v4 events path (processToEvent)", () => {
    it("does not populate model/usage/cost on invoke_agent spans but keeps name, timing, IO, and type", () => {
      const events = createProcessor().processToEvent([aiSdkInvokeAgentSpan]);

      expect(events).toHaveLength(1);
      const event = events[0];

      // No model / usage / cost — the child chat span carries the real usage
      expect(event.modelName).toBeUndefined();
      expect(isEmpty(event.providedUsageDetails)).toBe(true);
      expect(isEmpty(event.providedCostDetails)).toBe(true);

      // Everything else is preserved
      expect(event.name).toBe("invoke_agent gpt-4o-mini");
      expect(event.type).toBe("AGENT");
      expect(event.startTimeISO).toBe("2024-04-30T14:48:50.686Z");
      expect(event.endTimeISO).toBe("2024-04-30T14:48:50.687Z");
      expect(event.input).toBe('[{"role":"user","parts":[]}]');
      expect(event.output).toBe('[{"role":"assistant","parts":[]}]');
    });

    it("does not populate usage details on agent_step spans", () => {
      const events = createProcessor().processToEvent([aiSdkAgentStepSpan]);

      expect(events).toHaveLength(1);
      const event = events[0];

      expect(event.modelName).toBeUndefined();
      expect(isEmpty(event.providedUsageDetails)).toBe(true);
      expect(isEmpty(event.providedCostDetails)).toBe(true);
      expect(event.name).toBe("agent_step");
    });

    it("keeps model and usage on AI SDK chat spans", () => {
      const events = createProcessor().processToEvent([aiSdkChatSpan]);

      expect(events).toHaveLength(1);
      const event = events[0];

      expect(event.modelName).toBe("gpt-4o-mini");
      expect(event.type).toBe("GENERATION");
      expect(event.providedUsageDetails).toMatchObject({
        input: 100,
        output: 50,
      });
    });

    it("keeps model and usage on non-AI-SDK agent-type spans (OpenInference)", () => {
      const events = createProcessor().processToEvent([openInferenceAgentSpan]);

      expect(events).toHaveLength(1);
      const event = events[0];

      expect(event.modelName).toBe("gpt-4o-mini");
      expect(event.type).toBe("AGENT");
      expect(event.providedUsageDetails).toMatchObject({
        input: 100,
        output: 50,
      });
    });

    it("keeps model and usage on ordinary non-AI-SDK spans with usage attributes", () => {
      const events = createProcessor().processToEvent([genericGenAiSpan]);

      expect(events).toHaveLength(1);
      const event = events[0];

      expect(event.modelName).toBe("gpt-4o-mini");
      expect(event.providedUsageDetails).toMatchObject({
        input: 100,
        output: 50,
      });
    });
  });

  describe("legacy ingestion path (processToIngestionEvents)", () => {
    const getObservationEvent = async (resourceSpan: ResourceSpan) => {
      const events = await createProcessor().processToIngestionEvents([
        resourceSpan,
      ]);
      const observationEvents = events.filter(
        (e) => e.type !== "trace-create",
      ) as any[];
      expect(observationEvents).toHaveLength(1);
      return observationEvents[0];
    };

    it("does not populate model/usage/cost on invoke_agent spans but keeps name, timing, IO, and type", async () => {
      const event = await getObservationEvent(aiSdkInvokeAgentSpan);

      expect(event.type).toBe("agent-create");
      expect(event.body.model).toBeUndefined();
      expect(isEmpty(event.body.usageDetails)).toBe(true);
      expect(isEmpty(event.body.costDetails)).toBe(true);

      expect(event.body.name).toBe("invoke_agent gpt-4o-mini");
      expect(event.body.startTime).toBe("2024-04-30T14:48:50.686Z");
      expect(event.body.endTime).toBe("2024-04-30T14:48:50.687Z");
      expect(event.body.input).toBe('[{"role":"user","parts":[]}]');
      expect(event.body.output).toBe('[{"role":"assistant","parts":[]}]');
    });

    it("does not populate usage details on agent_step spans", async () => {
      const event = await getObservationEvent(aiSdkAgentStepSpan);

      expect(event.body.model).toBeUndefined();
      expect(isEmpty(event.body.usageDetails)).toBe(true);
      expect(isEmpty(event.body.costDetails)).toBe(true);
      expect(event.body.name).toBe("agent_step");
    });

    it("keeps model and usage on AI SDK chat spans", async () => {
      const event = await getObservationEvent(aiSdkChatSpan);

      expect(event.type).toBe("generation-create");
      expect(event.body.model).toBe("gpt-4o-mini");
      expect(event.body.usageDetails).toMatchObject({
        input: 100,
        output: 50,
      });
    });

    it("keeps model and usage on non-AI-SDK agent-type spans (OpenInference)", async () => {
      const event = await getObservationEvent(openInferenceAgentSpan);

      expect(event.type).toBe("agent-create");
      expect(event.body.model).toBe("gpt-4o-mini");
      expect(event.body.usageDetails).toMatchObject({
        input: 100,
        output: 50,
      });
    });

    it("keeps model and usage on ordinary non-AI-SDK spans with usage attributes", async () => {
      const event = await getObservationEvent(genericGenAiSpan);

      expect(event.body.model).toBe("gpt-4o-mini");
      expect(event.body.usageDetails).toMatchObject({
        input: 100,
        output: 50,
      });
    });
  });
});
