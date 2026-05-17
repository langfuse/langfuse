import { describe, it, expect } from "vitest";
import {
  estimateOtelSpanStringBytes,
  filterOversizedSpans,
} from "@langfuse/shared/src/server";

/** Helper to build a minimal raw OTEL span. */
function makeSpan(opts: {
  spanId?: string | Uint8Array;
  traceId?: string | Uint8Array;
  attributes?: Array<{ key: string; value: { stringValue?: string } }>;
  events?: Array<{
    name: string;
    attributes?: Array<{ key: string; value: { stringValue?: string } }>;
  }>;
}) {
  return {
    spanId: opts.spanId ?? "abc123",
    traceId: opts.traceId ?? "trace456",
    attributes: opts.attributes ?? [],
    events: opts.events ?? [],
  };
}

function bigString(bytes: number): string {
  return "x".repeat(bytes);
}

// ---------- estimateOtelSpanStringBytes ----------

describe("estimateOtelSpanStringBytes", () => {
  it("returns zero for a span with no string attributes", () => {
    expect(estimateOtelSpanStringBytes(makeSpan({}))).toBe(0);
  });

  it("sums bytes from span attributes", () => {
    const span = makeSpan({
      attributes: [
        { key: "foo", value: { stringValue: "hello" } },
        { key: "bar", value: { stringValue: "world!" } },
      ],
    });
    expect(estimateOtelSpanStringBytes(span)).toBe(11);
  });

  it("sums bytes from event attributes", () => {
    const span = makeSpan({
      events: [
        {
          name: "gen_ai.user.message",
          attributes: [
            { key: "gen_ai.content", value: { stringValue: "prompt text" } },
          ],
        },
      ],
    });
    expect(estimateOtelSpanStringBytes(span)).toBe(
      Buffer.byteLength("prompt text"),
    );
  });

  it("sums bytes across both attributes and events", () => {
    const span = makeSpan({
      attributes: [{ key: "k", value: { stringValue: "abcde" } }],
      events: [
        {
          name: "ev",
          attributes: [{ key: "k", value: { stringValue: "fghij" } }],
        },
      ],
    });
    expect(estimateOtelSpanStringBytes(span)).toBe(10);
  });

  it("counts multi-byte UTF-8 chars correctly", () => {
    const span = makeSpan({
      attributes: [{ key: "k", value: { stringValue: "é😀" } }],
    });
    expect(estimateOtelSpanStringBytes(span)).toBe(
      Buffer.byteLength("é😀", "utf8"),
    );
  });

  it("exits early when earlyExitBytes is exceeded", () => {
    const span = makeSpan({
      attributes: [
        { key: "a", value: { stringValue: bigString(600) } },
        { key: "b", value: { stringValue: bigString(600) } },
      ],
      events: [
        {
          name: "ev",
          attributes: [{ key: "c", value: { stringValue: bigString(600) } }],
        },
      ],
    });
    // Without early exit: 1800. With earlyExitBytes=1000, should return > 1000
    // but not necessarily 1800 (may stop after second attribute).
    const result = estimateOtelSpanStringBytes(span, 1000);
    expect(result).toBeGreaterThan(1000);
    expect(result).toBeLessThanOrEqual(1800);
  });

  it("handles missing/null attributes and events gracefully", () => {
    expect(estimateOtelSpanStringBytes(null)).toBe(0);
    expect(estimateOtelSpanStringBytes({})).toBe(0);
    expect(
      estimateOtelSpanStringBytes({ attributes: null, events: null }),
    ).toBe(0);
  });
});

// ---------- filterOversizedSpans ----------

describe("filterOversizedSpans", () => {
  const MAX = 1000;

  it("does not filter spans under the threshold", () => {
    const result = filterOversizedSpans(
      [
        {
          scopeSpans: [
            {
              spans: [
                makeSpan({
                  attributes: [{ key: "k", value: { stringValue: "small" } }],
                }),
              ],
            },
          ],
        },
      ],
      MAX,
      "proj-1",
    );
    expect(result.rejectedCount).toBe(0);
    expect(result.resourceSpans[0].scopeSpans[0].spans).toHaveLength(1);
  });

  it("removes a single oversized span and prunes empty containers", () => {
    const result = filterOversizedSpans(
      [
        {
          scopeSpans: [
            {
              spans: [
                makeSpan({
                  attributes: [
                    { key: "k", value: { stringValue: bigString(2000) } },
                  ],
                }),
              ],
            },
          ],
        },
      ],
      MAX,
      "proj-1",
    );
    expect(result.rejectedCount).toBe(1);
    expect(result.resourceSpans).toHaveLength(0);
  });

  it("keeps small spans and removes only oversized ones in a mixed batch", () => {
    const result = filterOversizedSpans(
      [
        {
          scopeSpans: [
            {
              spans: [
                makeSpan({
                  spanId: "small-1",
                  attributes: [{ key: "k", value: { stringValue: "ok" } }],
                }),
                makeSpan({
                  spanId: "big-1",
                  attributes: [
                    { key: "k", value: { stringValue: bigString(2000) } },
                  ],
                }),
                makeSpan({
                  spanId: "small-2",
                  attributes: [{ key: "k", value: { stringValue: "fine" } }],
                }),
              ],
            },
          ],
        },
      ],
      MAX,
      "proj-1",
    );
    expect(result.rejectedCount).toBe(1);
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(2);
    expect(spans[0].spanId).toBe("small-1");
    expect(spans[1].spanId).toBe("small-2");
  });

  it("prunes empty scopeSpans after removal", () => {
    const result = filterOversizedSpans(
      [
        {
          scopeSpans: [
            {
              spans: [
                makeSpan({
                  spanId: "big",
                  attributes: [
                    { key: "k", value: { stringValue: bigString(2000) } },
                  ],
                }),
              ],
            },
            {
              spans: [
                makeSpan({
                  spanId: "small",
                  attributes: [{ key: "k", value: { stringValue: "ok" } }],
                }),
              ],
            },
          ],
        },
      ],
      MAX,
      "proj-1",
    );
    expect(result.rejectedCount).toBe(1);
    expect(result.resourceSpans).toHaveLength(1);
    expect(result.resourceSpans[0].scopeSpans).toHaveLength(1);
    expect(result.resourceSpans[0].scopeSpans[0].spans[0].spanId).toBe("small");
  });

  it("handles all spans removed", () => {
    const result = filterOversizedSpans(
      [
        {
          scopeSpans: [
            {
              spans: [
                makeSpan({
                  attributes: [
                    { key: "k", value: { stringValue: bigString(2000) } },
                  ],
                }),
                makeSpan({
                  attributes: [
                    { key: "k", value: { stringValue: bigString(3000) } },
                  ],
                }),
              ],
            },
          ],
        },
      ],
      MAX,
      "proj-1",
    );
    expect(result.rejectedCount).toBe(2);
    expect(result.resourceSpans).toHaveLength(0);
  });

  it("prunes one resourceSpan entirely while keeping another", () => {
    const result = filterOversizedSpans(
      [
        {
          scopeSpans: [
            {
              spans: [
                makeSpan({
                  spanId: "big",
                  attributes: [
                    { key: "k", value: { stringValue: bigString(2000) } },
                  ],
                }),
              ],
            },
          ],
        },
        {
          scopeSpans: [
            {
              spans: [
                makeSpan({
                  spanId: "small",
                  attributes: [{ key: "k", value: { stringValue: "ok" } }],
                }),
              ],
            },
          ],
        },
      ],
      MAX,
      "proj-1",
    );
    expect(result.rejectedCount).toBe(1);
    expect(result.resourceSpans).toHaveLength(1);
    expect(result.resourceSpans[0].scopeSpans[0].spans[0].spanId).toBe("small");
  });

  it("handles missing attributes/events gracefully", () => {
    const result = filterOversizedSpans(
      [
        {
          scopeSpans: [
            {
              spans: [{ spanId: "s1", traceId: "t1" }],
            },
          ],
        },
      ],
      MAX,
      "proj-1",
    );
    expect(result.rejectedCount).toBe(0);
    expect(result.resourceSpans[0].scopeSpans[0].spans).toHaveLength(1);
  });
});
