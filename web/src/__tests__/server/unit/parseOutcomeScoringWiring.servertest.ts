// Mocked smoke test for the I/O side of `parseOutcomeScoring.ts`
// (`recordParseOutcomeScores`), which `parseOutcomeScoring.servertest.ts`
// deliberately does not cover (it only exercises the pure
// `deriveParseOutcomeScores`). This asserts the wiring — a `Langfuse` client
// gets constructed, `.score()` is called once per derived score with the
// expected name/dataType, and the batch is flushed — without a live
// Langfuse client or network call.
import { describe, expect, it, vi } from "vitest";

const scoreMock = vi.fn();
const flushAsyncMock = vi.fn().mockResolvedValue(undefined);

// `parseOutcomeScoring.ts` constructs its own `Langfuse` client directly
// (deliberately not via the shared `getLangfuseClient` helper — see its
// comment on `scoreClient`), so the raw SDK constructor is what needs
// mocking here, not a wrapper module.
vi.mock("langfuse", () => ({
  // A plain `function` (not an arrow function) — `parseOutcomeScoring.ts`
  // instantiates this via `new Langfuse(...)`, which arrow functions cannot
  // be used as a constructor for.
  Langfuse: vi.fn().mockImplementation(function MockLangfuse() {
    return {
      score: scoreMock,
      flushAsync: flushAsyncMock,
    };
  }),
}));

import {
  deriveParseOutcomeScores,
  recordParseOutcomeScores,
} from "@/src/features/search-bar/server/parseOutcomeScoring";

describe("recordParseOutcomeScores (mocked Langfuse client)", () => {
  it("scores the trace once per derived score and flushes the batch", () => {
    const scores = deriveParseOutcomeScores(
      '[{"type":"number","column":"latency","operator":">","value":2}]',
      {
        filters: [{} as never],
        queryText: "latency > 2",
        droppedCount: 0,
        unknownScoreNames: [],
      },
    );

    recordParseOutcomeScores({
      traceId: "trace-abc123",
      scores,
      publicKey: "pk-test",
      secretKey: "sk-test",
      baseUrl: "https://example.com",
    });

    // `recordParseOutcomeScores` runs its I/O synchronously up to the first
    // await (the flush race), so the `.score()` calls and the `flushAsync`
    // invocation are already observable without awaiting anything here.
    expect(scoreMock).toHaveBeenCalledTimes(5);
    expect(
      scoreMock.mock.calls.map(([call]) => ({
        name: call.name,
        dataType: call.dataType,
      })),
    ).toEqual([
      { name: "parse-empty-result", dataType: "BOOLEAN" },
      { name: "parse-dropped-filters", dataType: "NUMERIC" },
      { name: "parse-unknown-score-names", dataType: "NUMERIC" },
      { name: "filter-count", dataType: "NUMERIC" },
      { name: "output-markdown-fenced", dataType: "BOOLEAN" },
    ]);
    expect(
      scoreMock.mock.calls.every(([call]) => call.traceId === "trace-abc123"),
    ).toBe(true);
    expect(flushAsyncMock).toHaveBeenCalledTimes(1);
  });
});
