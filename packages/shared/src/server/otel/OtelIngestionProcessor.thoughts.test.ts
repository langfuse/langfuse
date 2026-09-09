/**
 * Regression test for #16321: gcp.vertex.agent usage ingestion should
 * extract Gemini thought tokens from `usage_metadata.thoughts_token_count`
 * and surface them as `output_reasoning_tokens`. The cost calculation
 * already prices these via the `output_reasoning_tokens` alias added in
 * #15082, so emitting the field is the full fix.
 *
 * Out of scope here: also setting `output` from `candidates_token_count`
 * and `input` from `prompt_token_count`. The pre-existing block only
 * adjusts `input_cached_tokens`; broadening that is a follow-up.
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

const createProcessor = () =>
  new OtelIngestionProcessor({
    projectId: "test-project-16321",
    publicKey: "pk-test",
    sdkName: "python",
    sdkVersion: "3.8.1",
  });

const buildVertexBatchWithExtras = (
  llmResponseJson: string,
  extraAttributes: Array<{ key: string; value: Record<string, unknown> }>,
): ResourceSpan[] => {
  const base = buildVertexBatch(llmResponseJson);
  const span = base[0]?.scopeSpans?.[0]?.spans?.[0];
  if (span?.attributes) {
    span.attributes.push(...extraAttributes);
  }
  return base;
};

const buildVertexBatch = (llmResponseJson: string): ResourceSpan[] => [
  {
    resource: {
      attributes: [{ key: "service.name", value: { stringValue: "test-svc" } }],
    },
    scopeSpans: [
      {
        scope: {
          name: "gcp.vertex.agent",
          version: "1.0.0",
          attributes: [
            { key: "public_key", value: { stringValue: "pk-test" } },
          ],
        },
        spans: [
          {
            traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
            spanId: Buffer.from("0123456789abcdef", "hex"),
            name: "vertex-span",
            kind: 1,
            startTimeUnixNano: "1752384000000000000",
            endTimeUnixNano: "1752384001000000000",
            attributes: [
              {
                key: "langfuse.observation.type",
                value: { stringValue: "generation" },
              },
              {
                key: "gcp.vertex.agent.llm_response",
                value: { stringValue: llmResponseJson },
              },
            ],
            status: {},
          },
        ],
      },
    ],
  },
];

// Pull providedUsageDetails from the GENERATION observation in the events.
const getUsage = (llmResponseJson: string) => {
  const events = createProcessor().processToEvent(
    buildVertexBatch(llmResponseJson),
  );
  const gen = events.find(
    (e: { type?: string }) => e?.type === "GENERATION",
  ) as { providedUsageDetails?: Record<string, number> } | undefined;
  return gen?.providedUsageDetails;
};

describe("gcp.vertex.agent thoughts_token_count extraction (regression for #16321)", () => {
  it("extracts thoughts_token_count into output_reasoning_tokens", () => {
    // Issue scenario (compressed): the user sees Σ total in Langfuse include
    // thoughts, but the cost is too low because thoughts are never priced.
    // After this fix, the raw thought count is emitted so the cost
    // calculator (which already has `output_reasoning_tokens` as a Gemini
    // reasoning alias per #15082) can price it.
    const usage = getUsage(
      JSON.stringify({
        usage_metadata: {
          prompt_token_count: 100,
          candidates_token_count: 50,
          thoughts_token_count: 200,
          total_token_count: 350,
        },
      }),
    );
    expect(usage).toBeDefined();
    expect(usage?.output_reasoning_tokens).toBe(200);
    // input/output are out of scope for this fix; the existing branch
    // only adjusts input_cached_tokens and lets the cost side
    // double-count (it always has). We just verify thoughts now show up.
  });

  it("preserves cached_content_token_count when both fields are present", () => {
    // The gcp.vertex branch already handles cached_content_token_count
    // (extracted as input_cached_tokens). Verify that fix is unaffected
    // by the new thoughts handling — both fields should coexist.
    const usage = getUsage(
      JSON.stringify({
        usage_metadata: {
          prompt_token_count: 1000,
          candidates_token_count: 200,
          thoughts_token_count: 80,
          total_token_count: 1280,
          cached_content_token_count: 50,
        },
      }),
    );
    expect(usage?.output_reasoning_tokens).toBe(80);
    expect(usage?.input_cached_tokens).toBe(50);
  });

  it("does not set output_reasoning_tokens when thoughts_token_count is missing", () => {
    const usage = getUsage(
      JSON.stringify({
        usage_metadata: {
          prompt_token_count: 100,
          candidates_token_count: 50,
          total_token_count: 150,
        },
      }),
    );
    expect(usage?.output_reasoning_tokens).toBeUndefined();
  });

  it("does not set output_reasoning_tokens when thoughts_token_count is zero", () => {
    // Zero is not "missing" but also not > 0, so the guard `> 0` skips it.
    // Edge case worth pinning: a zero should not emit the field.
    const usage = getUsage(
      JSON.stringify({
        usage_metadata: {
          prompt_token_count: 100,
          candidates_token_count: 50,
          thoughts_token_count: 0,
          total_token_count: 150,
        },
      }),
    );
    expect(usage?.output_reasoning_tokens).toBeUndefined();
  });

  it("ignores non-numeric thoughts_token_count gracefully", () => {
    // Defensive: a string value (e.g., from a future API revision that
    // emits a number-as-string) must not crash the extractor.
    const usage = getUsage(
      JSON.stringify({
        usage_metadata: {
          prompt_token_count: 100,
          candidates_token_count: 50,
          thoughts_token_count: "not-a-number",
          total_token_count: 150,
        },
      }),
    );
    expect(usage?.output_reasoning_tokens).toBeUndefined();
  });

  it("tolerates missing usage_metadata without throwing", () => {
    const usage = getUsage(JSON.stringify({ some_other_field: 42 }));
    // Empty usage_details collapses to undefined via the UsageDetails Zod
    // transform's "length > 0" guard. The processor must not throw and
    // providedUsageDetails is simply absent.
    expect(usage).toBeUndefined();
  });

  it("does not overwrite output_reasoning_tokens already set by gen_ai.usage.*", () => {
    // If the SDK already emitted `gen_ai.usage.completion_details.reasoning`,
    // extractGenericGenAiUsageDetails sets output_reasoning_tokens. The
    // gcp.vertex branch should NOT overwrite it with the (possibly stale
    // or missing) thoughts_token_count.
    // gen_ai.usage.* are TOP-LEVEL OTel attributes, not nested in the
    // llm_response payload.
    const events = createProcessor().processToEvent(
      buildVertexBatchWithExtras(
        JSON.stringify({
          prompt_token_count: 50,
          candidates_token_count: 100,
          thoughts_token_count: 999, // would be ignored if extraction respected the existing field
          total_token_count: 192,
        }),
        [
          {
            key: "gen_ai.usage.completion_details.reasoning",
            value: { intValue: 42 },
          },
          { key: "gen_ai.usage.completion_tokens", value: { intValue: 100 } },
          { key: "gen_ai.usage.prompt_tokens", value: { intValue: 50 } },
          { key: "gen_ai.usage.total_tokens", value: { intValue: 192 } },
        ],
      ),
    );
    const gen = events.find(
      (e: { type?: string }) => e?.type === "GENERATION",
    ) as { providedUsageDetails?: Record<string, number> } | undefined;
    expect(gen?.providedUsageDetails?.output_reasoning_tokens).toBe(42);
    // output = completion_tokens (100) - completion_details.reasoning (42) = 58
    expect(gen?.providedUsageDetails?.output).toBe(58);
  });
});
