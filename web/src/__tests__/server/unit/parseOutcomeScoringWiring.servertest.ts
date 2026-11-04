// Mocked smoke test for the I/O side of `parseOutcomeScoring.ts`
// (`recordParseOutcomeScores`), which `parseOutcomeScoring.servertest.ts`
// deliberately does not cover (it only exercises the pure
// `deriveParseOutcomeScores`). This asserts the wiring — a `LangfuseClient` client
// is retrieved, `.api.scores.create()` submits the derived scores with
// the expected name/dataType in one batch — without a live
// Langfuse client or network call.
import { describe, expect, it, vi } from "vitest";

const scoreMock = vi.fn().mockResolvedValue({ accepted: 5, rejected: 0 });

vi.mock("@/src/features/natural-language-filters/server/utils", () => ({
  getLangfuseClient: vi.fn(() => ({
    api: { scores: { create: scoreMock } },
  })),
}));

import { getLangfuseClient } from "@/src/features/natural-language-filters/server/utils";
import {
  deriveParseOutcomeScores,
  recordParseOutcomeScores,
} from "@/src/features/search-bar/server/parseOutcomeScoring";

describe("recordParseOutcomeScores (mocked Langfuse client)", () => {
  it("submits the derived scores for the trace in one batch", () => {
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
    // await (the request race), so the `.api.scores.create()` invocation
    // is already observable without awaiting anything here.
    expect(getLangfuseClient).toHaveBeenCalledWith(
      "pk-test",
      "sk-test",
      "https://example.com",
    );
    expect(scoreMock).toHaveBeenCalledTimes(1);
    const [submittedScores, requestOptions] = scoreMock.mock.calls[0];
    expect(requestOptions).toEqual({ maxRetries: 0, timeoutInSeconds: 3 });
    expect(
      submittedScores.map((call: { name: string; dataType: string }) => ({
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
      submittedScores.every(
        (call: { traceId: string }) => call.traceId === "trace-abc123",
      ),
    ).toBe(true);
  });
});
