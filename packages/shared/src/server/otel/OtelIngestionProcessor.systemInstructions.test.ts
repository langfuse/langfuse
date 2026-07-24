/**
 * Regression tests for gen_ai.system_instructions handling in the OTel
 * ingestion processor. See issue #15336.
 *
 * Two emitter shapes are supported:
 * - "parts" shape (pydantic-ai, etc.): array of text-part objects
 *   like {type: "text", content: "..."}. Joined into a single system
 *   message — pre-fix behavior, kept for backward compatibility.
 * - "structured message" shape (LiteLLM, etc.): array of complete
 *   messages like {role: "system", parts: [...]}. Each is preserved
 *   as its own system message so non-text parts survive ingestion.
 *
 * The pre-fix bug: structured messages fell through to `String(p)`,
 * producing the literal string "[object Object]" and silently
 * destroying the captured system instructions.
 *
 * processToIngestionEvents awaits redis.set (seen-traces tracking);
 * CI's tests-shared job sets REDIS_HOST without a running Redis
 * server, so we stub the client the same way the metadata_dropped
 * test does.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../redis/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../redis/redis")>()),
  redis: { set: vi.fn().mockResolvedValue("OK") },
}));

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

const PROJECT_ID = "test-project-lfe-15336";

const createProcessor = () =>
  new OtelIngestionProcessor({
    projectId: PROJECT_ID,
    publicKey: "pk-test",
    sdkName: "python",
    sdkVersion: "3.8.1",
  });

// Build a single-span OTel batch with the given span attributes. Uses
// pydantic-ai scope so the OpenTelemetry messages path is exercised
// (the path that calls prependSystemInstructions for the system
// instructions attribute).
const buildPydanticAiBatch = (
  systemInstructionsJson: string,
  allMessagesJson: string,
): ResourceSpan[] => [
  {
    resource: {
      attributes: [
        { key: "service.name", value: { stringValue: "test-svc" } },
      ],
    },
    scopeSpans: [
      {
        scope: {
          name: "pydantic-ai",
          version: "1.66.0",
          attributes: [],
        },
        spans: [
          {
            traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
            spanId: Buffer.from("0123456789abcdef", "hex"),
            name: "agent-run",
            kind: 1,
            startTimeUnixNano: "1752384000000000000",
            endTimeUnixNano: "1752384001000000000",
            attributes: [
              {
                key: "langfuse.observation.type",
                value: { stringValue: "span" },
              },
              {
                key: "pydantic_ai.all_messages",
                value: { stringValue: allMessagesJson },
              },
              {
                key: "gen_ai.system_instructions",
                value: { stringValue: systemInstructionsJson },
              },
            ],
            status: {},
          },
        ],
      },
    ],
  },
];

// Same as above but exercises the generic OpenTelemetry path
// (gen_ai.input.messages + gen_ai.system_instructions, no pydantic-ai
// scope). Used to confirm both call sites behave the same.
const buildGenericOtelBatch = (
  systemInstructionsJson: string,
  inputMessagesJson: string,
): ResourceSpan[] => [
  {
    resource: {
      attributes: [
        { key: "service.name", value: { stringValue: "test-svc" } },
      ],
    },
    scopeSpans: [
      {
        scope: {
          name: "openinference-instrumentation-openai",
          version: "0.1.0",
          attributes: [],
        },
        spans: [
          {
            traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
            spanId: Buffer.from("0123456789abcdef", "hex"),
            name: "chat",
            kind: 1,
            startTimeUnixNano: "1752384000000000000",
            endTimeUnixNano: "1752384001000000000",
            attributes: [
              {
                key: "langfuse.observation.type",
                value: { stringValue: "generation" },
              },
              {
                key: "gen_ai.input.messages",
                value: { stringValue: inputMessagesJson },
              },
              {
                key: "gen_ai.system_instructions",
                value: { stringValue: systemInstructionsJson },
              },
            ],
            status: {},
          },
        ],
      },
    ],
  },
];

// LiteLLM's actual emission shape per
// https://github.com/BerriAI/litellm/blob/301a02b7/tests/test_litellm/integrations/test_opentelemetry.py#L4059
const LITELLM_SYSTEM_INSTRUCTIONS = JSON.stringify([
  {
    role: "system",
    parts: [
      {
        type: "text",
        content: "You are a helpful assistant.",
      },
    ],
  },
]);

// Pydantic-AI emission shape, mirrors the pre-fix otelMapping.servertest
// fixture so the existing behavior is regression-tested.
const PYDANTIC_AI_SYSTEM_INSTRUCTIONS = JSON.stringify([
  {
    type: "text",
    content: "You are a helpful assistant.",
  },
]);

const ALL_MESSAGES = JSON.stringify([
  {
    role: "user",
    parts: [{ type: "text", content: "Hello" }],
  },
]);

const findSpanEvent = (events: ReadonlyArray<unknown>) =>
  events.find(
    (e): e is { type: string; body: { input?: unknown } } =>
      typeof e === "object" &&
      e !== null &&
      "type" in e &&
      (e as { type: unknown }).type === "span-create" &&
      "body" in e &&
      typeof (e as { body: unknown }).body === "object" &&
      (e as { body: unknown }).body !== null,
  );

describe("OtelIngestionProcessor: gen_ai.system_instructions (#15336)", () => {
  describe("structured message shape (LiteLLM) — {role, parts}", () => {
    it("preserves a single structured system message and does NOT coerce to '[object Object]'", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildPydanticAiBatch(LITELLM_SYSTEM_INSTRUCTIONS, ALL_MESSAGES),
      );

      const spanEvent = findSpanEvent(events);
      const input = JSON.parse((spanEvent?.body.input ?? "[]") as string);
      expect(input).toHaveLength(2);

      // The first message is the preserved structured system message,
      // not a string-coerced "[object Object]".
      const system = input[0];
      expect(system.role).toBe("system");
      expect(system.parts).toEqual([
        { type: "text", content: "You are a helpful assistant." },
      ]);
      expect(system.content).toBeUndefined();

      // The original user message is unchanged.
      expect(input[1]).toEqual({
        role: "user",
        parts: [{ type: "text", content: "Hello" }],
      });
    });

    it("preserves multiple structured system messages as separate system messages", async () => {
      const instructions = JSON.stringify([
        {
          role: "system",
          parts: [{ type: "text", content: "You are concise." }],
        },
        {
          role: "system",
          parts: [{ type: "text", content: "You are precise." }],
        },
      ]);
      const events = await createProcessor().processToIngestionEvents(
        buildPydanticAiBatch(instructions, ALL_MESSAGES),
      );

      const input = JSON.parse(
        (findSpanEvent(events)?.body.input ?? "[]") as string,
      );
      expect(input).toHaveLength(3);
      expect(input[0]).toEqual({
        role: "system",
        parts: [{ type: "text", content: "You are concise." }],
      });
      expect(input[1]).toEqual({
        role: "system",
        parts: [{ type: "text", content: "You are precise." }],
      });
      expect(input[2].role).toBe("user");
    });

    it("preserves non-text parts (e.g. tool/function parts) without string coercion", async () => {
      const instructions = JSON.stringify([
        {
          role: "system",
          parts: [
            { type: "text", content: "Use the calculator." },
            {
              type: "function",
              name: "calculator",
              input: { expression: "2+2" },
            },
          ],
        },
      ]);
      const events = await createProcessor().processToIngestionEvents(
        buildPydanticAiBatch(instructions, ALL_MESSAGES),
      );

      const input = JSON.parse(
        (findSpanEvent(events)?.body.input ?? "[]") as string,
      );
      expect(input[0].parts).toEqual([
        { type: "text", content: "Use the calculator." },
        { type: "function", name: "calculator", input: { expression: "2+2" } },
      ]);
      expect(input[0].content).toBeUndefined();
    });

    it("fills a missing role with 'system'", async () => {
      const instructions = JSON.stringify([
        { parts: [{ type: "text", content: "no role here" }] },
      ]);
      const events = await createProcessor().processToIngestionEvents(
        buildPydanticAiBatch(instructions, ALL_MESSAGES),
      );

      const input = JSON.parse(
        (findSpanEvent(events)?.body.input ?? "[]") as string,
      );
      expect(input[0].role).toBe("system");
      expect(input[0].parts).toEqual([
        { type: "text", content: "no role here" },
      ]);
    });
  });

  describe("parts shape (pydantic-ai) — {type, content} — backward compatibility", () => {
    it("joins text content into a single {role: 'system', content} message", async () => {
      // Mirrors the pre-fix otelMapping.servertest.ts fixture at line 2413.
      const events = await createProcessor().processToIngestionEvents(
        buildPydanticAiBatch(PYDANTIC_AI_SYSTEM_INSTRUCTIONS, ALL_MESSAGES),
      );

      const input = JSON.parse(
        (findSpanEvent(events)?.body.input ?? "[]") as string,
      );
      expect(input).toHaveLength(2);
      expect(input[0]).toEqual({
        role: "system",
        content: "You are a helpful assistant.",
      });
      expect(input[1].role).toBe("user");
    });

    it("joins multiple text parts with newlines", async () => {
      const instructions = JSON.stringify([
        { type: "text", content: "Be concise." },
        { type: "text", content: "Be accurate." },
      ]);
      const events = await createProcessor().processToIngestionEvents(
        buildPydanticAiBatch(instructions, ALL_MESSAGES),
      );

      const input = JSON.parse(
        (findSpanEvent(events)?.body.input ?? "[]") as string,
      );
      expect(input[0]).toEqual({
        role: "system",
        content: "Be concise.\nBe accurate.",
      });
    });
  });

  describe("plain string instructions", () => {
    it("wraps a plain string in {role: 'system', content}", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildPydanticAiBatch(JSON.stringify("Be helpful."), ALL_MESSAGES),
      );

      const input = JSON.parse(
        (findSpanEvent(events)?.body.input ?? "[]") as string,
      );
      expect(input[0]).toEqual({ role: "system", content: "Be helpful." });
    });
  });

  describe("safety: empty / malformed / unsafe input", () => {
    it("does not prepend anything when system instructions is an empty array", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildPydanticAiBatch("[]", ALL_MESSAGES),
      );

      const input = JSON.parse(
        (findSpanEvent(events)?.body.input ?? "[]") as string,
      );
      expect(input).toHaveLength(1);
      expect(input[0].role).toBe("user");
    });

    it("does not prepend when system instructions is an array of only unsafe values", async () => {
      // Numbers, booleans, null — none can become useful content and
      // the pre-fix code would have stringified them, which the
      // post-fix code refuses to do silently.
      const instructions = JSON.stringify([42, true, null]);
      const events = await createProcessor().processToIngestionEvents(
        buildPydanticAiBatch(instructions, ALL_MESSAGES),
      );

      const input = JSON.parse(
        (findSpanEvent(events)?.body.input ?? "[]") as string,
      );
      // Only the original user message remains.
      expect(input).toHaveLength(1);
      expect(input[0].role).toBe("user");
    });

    it("falls back to a single system message when system instructions is invalid JSON", async () => {
      // The whole point of the try/catch in parseSystemInstructions: a
      // bad JSON string should not crash ingestion. It should be
      // wrapped as {role: 'system', content: <raw>}.
      const events = await createProcessor().processToIngestionEvents(
        buildPydanticAiBatch("not valid json", ALL_MESSAGES),
      );

      const input = JSON.parse(
        (findSpanEvent(events)?.body.input ?? "[]") as string,
      );
      expect(input[0]).toEqual({
        role: "system",
        content: "not valid json",
      });
    });

    it("does not duplicate the system message when input already contains one", async () => {
      const userMessages = JSON.stringify([
        { role: "system", parts: [{ type: "text", content: "Pre-existing." }] },
        { role: "user", parts: [{ type: "text", content: "Hello" }] },
      ]);
      const events = await createProcessor().processToIngestionEvents(
        buildPydanticAiBatch(LITELLM_SYSTEM_INSTRUCTIONS, userMessages),
      );

      const input = JSON.parse(
        (findSpanEvent(events)?.body.input ?? "[]") as string,
      );
      // No prepending happened — the pre-existing system message is the
      // first entry, and the new LiteLLM system message was dropped.
      expect(input).toHaveLength(2);
      expect(input[0]).toEqual({
        role: "system",
        parts: [{ type: "text", content: "Pre-existing." }],
      });
      expect(input[1].role).toBe("user");
    });
  });

  describe("generic OpenTelemetry path (gen_ai.input.messages)", () => {
    // The two call sites of prependSystemInstructions are the pydantic-ai
    // path (tested above) and the generic OpenTelemetry path. The
    // structured-message fix should apply to both.

    const genericInputMessages = JSON.stringify([
      { role: "user", content: "What is 2+2?" },
    ]);

    it("preserves structured system messages via the generic OTEL path", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildGenericOtelBatch(LITELLM_SYSTEM_INSTRUCTIONS, genericInputMessages),
      );

      const spanEvent = events.find((e) => e.type === "generation-create");
      const input = JSON.parse((spanEvent?.body.input ?? "[]") as string);
      expect(input).toHaveLength(2);
      expect(input[0]).toEqual({
        role: "system",
        parts: [{ type: "text", content: "You are a helpful assistant." }],
      });
      expect(input[1]).toEqual({
        role: "user",
        content: "What is 2+2?",
      });
    });
  });
});
