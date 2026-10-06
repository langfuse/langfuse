import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { context, SpanStatusCode } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { TraceSinkParams } from "../llm/types";
import { generateTopicText } from "./text";

const { publishInternalOtelSpans } = vi.hoisted(() => ({
  publishInternalOtelSpans: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../otel/internalTraceOtelWriter", () => ({
  publishInternalOtelSpans,
}));

vi.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: vi.fn(() => async () => ({
    accessKeyId: "topics-test-key",
    secretAccessKey: "topics-test-secret",
    sessionToken: "topics-test-session",
  })),
}));

beforeEach(() => {
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable(),
  );
});

afterEach(() => {
  context.disable();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("generateTopicText", () => {
  it.each(["us.openai.gpt-5.6-luna", "us.openai.gpt-5.6-terra"])(
    "serializes %s structured output through Bedrock with the Topics profile",
    async (model) => {
      const schema = z.object({ summary: z.string() });
      const output = { summary: "Account access" };
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({
          output: {
            message: {
              role: "assistant",
              content: [
                {
                  toolUse: { toolUseId: "json-1", name: "json", input: output },
                },
              ],
            },
          },
          stopReason: "tool_use",
          usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
          metrics: { latencyMs: 1 },
        }),
      );
      vi.stubGlobal("fetch", fetch);
      vi.stubEnv("AWS_BEARER_TOKEN_BEDROCK", "ambient-bearer-token");

      const result = await generateTopicText({
        model,
        messages: [
          { role: "system", content: "Summarize the user's request." },
          { role: "user", content: "I cannot sign in." },
        ],
        schema,
        maxOutputTokens: 256,
        region: "eu-central-1",
        profile: "topics-local",
      });

      expect(fromNodeProviderChain).toHaveBeenCalledWith({
        profile: "topics-local",
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      const request = new Request(...fetch.mock.calls[0]);
      expect(request.url).toBe(
        `https://bedrock-runtime.eu-central-1.amazonaws.com/model/${model}/converse`,
      );
      expect(request.headers.get("authorization")).toMatch(
        /^AWS4-HMAC-SHA256 Credential=topics-test-key\//,
      );
      expect(request.headers.get("x-amz-security-token")).toBe(
        "topics-test-session",
      );
      const body = await request.json();
      expect(body).toMatchObject({
        system: [{ text: "Summarize the user's request." }],
        messages: [{ role: "user", content: [{ text: "I cannot sign in." }] }],
        inferenceConfig: { maxTokens: 256 },
        additionalModelRequestFields: { reasoning: { effort: "none" } },
        toolConfig: {
          tools: [
            {
              toolSpec: {
                name: "json",
                inputSchema: {
                  json: {
                    type: "object",
                    properties: { summary: { type: "string" } },
                    required: ["summary"],
                    additionalProperties: false,
                  },
                },
              },
            },
          ],
          toolChoice: { any: {} },
        },
      });
      expect(body).not.toHaveProperty("inferenceConfig.temperature");
      expect(result.output).toEqual(output);
      expect(result.usage).toMatchObject({
        inputTokens: 12,
        outputTokens: 4,
        totalTokens: 16,
      });
      expect(publishInternalOtelSpans).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "captures structured text and usage without changing the result when publishing fails: %s",
    async (publishingFails) => {
      if (publishingFails) {
        publishInternalOtelSpans.mockRejectedValueOnce(new Error("queue down"));
      }
      const output = { summary: "Account access" };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            output: {
              message: {
                role: "assistant",
                content: [
                  {
                    toolUse: {
                      toolUseId: "json-1",
                      name: "json",
                      input: output,
                    },
                  },
                ],
              },
            },
            stopReason: "tool_use",
            usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
            metrics: { latencyMs: 1 },
          }),
        ),
      );

      const result = await generateTopicText(tracedCall);

      expect(result.output).toEqual(output);
      expect(publishInternalOtelSpans).toHaveBeenCalledTimes(1);
      expect(publishInternalOtelSpans).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: trace.targetProjectId,
          isLangfuseInternal: true,
        }),
      );
      const spans: ReadableSpan[] =
        publishInternalOtelSpans.mock.calls[0][0].spans;
      expect(spans).toHaveLength(2);
      const root = spans.find((span) => span.name === trace.traceName)!;
      const generation = spans.find((span) => span !== root)!;
      expect(root.attributes).toMatchObject({
        "langfuse.observation.input": JSON.stringify(tracedCall.messages),
        "langfuse.observation.output": JSON.stringify(output),
      });
      expect(generation.attributes).toMatchObject({
        "gen_ai.request.model": tracedCall.model,
        "gen_ai.usage.input_tokens": 12,
        "gen_ai.usage.output_tokens": 4,
        "langfuse.environment": "langfuse-topics",
      });
      expect(generation.spanContext().traceId).toBe(trace.traceId);
      expect(generation.parentSpanContext?.spanId).toBe(
        root.spanContext().spanId,
      );
    },
  );

  it("flushes failed calls and preserves the provider error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ message: "Topics model unavailable" }, { status: 400 }),
      ),
    );

    await expect(generateTopicText(tracedCall)).rejects.toThrow(
      "Topics model unavailable",
    );

    expect(publishInternalOtelSpans).toHaveBeenCalledTimes(1);
    const spans: ReadableSpan[] =
      publishInternalOtelSpans.mock.calls[0][0].spans;
    const root = spans.find((span) => span.name === trace.traceName)!;
    expect(root.status).toMatchObject({
      code: SpanStatusCode.ERROR,
      message: "Topics model unavailable",
    });
  });

  it("rejects a host-reshaping region before resolving credentials or sending a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      generateTopicText({
        model: "us.openai.gpt-5.6-luna",
        messages: [{ role: "user", content: "Hi" }],
        schema: z.object({ summary: z.string() }),
        maxOutputTokens: 256,
        region: "eu-central-1.attacker.test",
      }),
    ).rejects.toThrow("Invalid Bedrock region");
    expect(fromNodeProviderChain).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

const trace: TraceSinkParams = {
  targetProjectId: "ai-features-project",
  traceId: "0af7651916cd43dd8448eb211c80319c",
  traceName: "topics-summary",
  environment: "langfuse-topics",
};

const tracedCall = {
  model: "us.openai.gpt-5.6-luna",
  messages: [{ role: "user" as const, content: "I cannot sign in." }],
  schema: z.object({ summary: z.string() }),
  maxOutputTokens: 256,
  region: "eu-central-1",
  trace,
};
