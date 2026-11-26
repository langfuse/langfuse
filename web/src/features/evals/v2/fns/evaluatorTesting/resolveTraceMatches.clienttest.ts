import { describe, expect, it } from "vitest";

import { resolveTraceMatches } from "./resolveTraceMatches";

describe("resolveTraceMatches", () => {
  it("keeps loaded matches when a later refetch fails", () => {
    expect(
      resolveTraceMatches({
        traceId: "trace-1",
        isComplete: true,
        hasFailed: true,
        pages: [["match-1"], ["match-2"]],
      }),
    ).toEqual({ samples: ["match-1", "match-2"], isSettled: true });
  });

  it("settles without matches when the lookup fails before it completes", () => {
    expect(
      resolveTraceMatches({
        traceId: "trace-1",
        isComplete: false,
        hasFailed: true,
        pages: [["match-1"]],
      }),
    ).toEqual({ samples: [], isSettled: true });
  });
});
