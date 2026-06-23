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

  it("ignores non-object metadata (strings/null/arrays)", () => {
    const ctx = buildAiContext({
      observed: undefined,
      sampleMetadata: ["a string", null, [1, 2, 3]],
      resultCount: null,
    });
    expect(ctx).toBeUndefined();
  });
});
