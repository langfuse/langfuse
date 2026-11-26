import { describe, expect, it } from "vitest";

import { resolveTraceMatches } from "./resolveTraceMatches";

describe("resolveTraceMatches", () => {
  it("keeps a failed lookup closed after a retry loads its matches", () => {
    expect(
      resolveTraceMatches({
        traceId: "trace-1",
        isComplete: true,
        hasFailed: true,
        pages: [["earlier-match"]],
      }),
    ).toEqual({ samples: [], isSettled: true });
  });
});
