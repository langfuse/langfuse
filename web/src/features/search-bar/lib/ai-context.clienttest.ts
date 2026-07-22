import { describe, expect, it } from "vitest";

import { buildAiContext } from "./ai-context";

describe("buildAiContext", () => {
  it("renders observed values and flattens nested metadata keys with examples", () => {
    const ctx = buildAiContext({
      observed: {
        type: [{ value: "GENERATION" }, { value: "SPAN" }],
        traceName: [{ value: "SupportChatSession" }],
      },
      sampleMetadata: [
        { routing: { queue: "membership-support" }, region: "eu" },
      ],
      resultCount: 1234,
    });
    expect(ctx).toContain("type: GENERATION, SPAN");
    expect(ctx).toContain("traceName");
    expect(ctx).toContain("metadata.routing.queue");
    expect(ctx).toContain("membership-support"); // example leaf value
    expect(ctx).toContain("showing 1234 row");
  });

  it("warns when the current view is empty", () => {
    const ctx =
      buildAiContext({
        observed: { level: [{ value: "ERROR" }] },
        sampleMetadata: [],
        resultCount: 0,
      }) ?? "";
    expect(ctx).toContain("no visible rows");
    expect(ctx).toContain("too strict");
  });

  it("returns undefined when there is nothing useful", () => {
    expect(
      buildAiContext({
        observed: undefined,
        sampleMetadata: [],
        resultCount: null,
      }),
    ).toBeUndefined();
    expect(
      buildAiContext({ observed: {}, sampleMetadata: [{}], resultCount: null }),
    ).toBeUndefined();
  });

  it("caps the number of metadata keys", () => {
    const big: Record<string, number> = {};
    for (let i = 0; i < 100; i++) big[`k${i}`] = i;
    const ctx =
      buildAiContext({
        observed: undefined,
        sampleMetadata: [big],
        resultCount: null,
      }) ?? "";
    const count = (ctx.match(/- metadata\./g) ?? []).length;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(30);
  });

  it("ignores non-JSON metadata (plain strings/null/arrays)", () => {
    const ctx = buildAiContext({
      observed: undefined,
      sampleMetadata: ["a string", null, [1, 2, 3]],
      resultCount: null,
    });
    expect(ctx).toBeUndefined();
  });

  it("parses JSON-string metadata (Langfuse's row shape) with dotted keys", () => {
    const ctx =
      buildAiContext({
        observed: undefined,
        sampleMetadata: [
          '{"routing.queue":"membership-support","customer.plan":"free","flags.beta":true}',
        ],
        resultCount: null,
      }) ?? "";
    expect(ctx).toContain("metadata.routing.queue");
    expect(ctx).toContain("membership-support");
    expect(ctx).toContain("metadata.customer.plan");
  });

  it("lists observed score names per column and level", () => {
    const ctx =
      buildAiContext({
        observed: {
          scores_avg: [{ value: "helpfulness-rating" }, { value: "accuracy" }],
          score_categories: [{ value: "sentiment" }],
          trace_scores_avg: [{ value: "overall-quality" }],
          trace_score_categories: [{ value: "Hallucination Check" }],
        },
        sampleMetadata: [],
        resultCount: null,
      }) ?? "";
    expect(ctx).toContain(
      "scores.<name> (numeric): helpfulness-rating, accuracy",
    );
    expect(ctx).toContain("scores.<name> (categorical): sentiment");
    expect(ctx).toContain("traceScores.<name> (numeric): overall-quality");
    expect(ctx).toContain(
      "traceScores.<name> (categorical): Hallucination Check",
    );
  });

  it("caps observed value length and total context size", () => {
    const ctx =
      buildAiContext({
        observed: {
          traceName: [{ value: "x".repeat(200) }],
          environment: Array.from({ length: 60 }, (_, i) => ({
            value: `env-${i}-${"y".repeat(120)}`,
          })),
        },
        sampleMetadata: [],
        resultCount: null,
      }) ?? "";
    // individual values truncated to MAX_VALUE_LEN (40)
    expect(ctx).not.toContain("x".repeat(41));
    // total stays under the endpoint's 16k input cap
    expect(ctx.length).toBeLessThanOrEqual(12000);
  });
});
