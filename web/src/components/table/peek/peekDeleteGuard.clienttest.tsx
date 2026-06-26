import { describe, expect, it } from "vitest";

import { shouldClosePeekAfterDelete } from "@/src/components/table/peek";

/**
 * LFE-10535 (#3): deleting trace A then K/J-navigating to trace B before the
 * delete resolves must NOT close B's peek. The peek closes on a successful
 * delete only while it still shows the trace that was deleted.
 */
describe("shouldClosePeekAfterDelete (LFE-10535)", () => {
  it("closes when the peek still shows the deleted trace", () => {
    expect(shouldClosePeekAfterDelete("trace-a", "trace-a")).toBe(true);
  });

  it("keeps the peek open when it moved on to another trace", () => {
    expect(shouldClosePeekAfterDelete("trace-b", "trace-a")).toBe(false);
  });

  it("does not close when the peek is already gone", () => {
    expect(shouldClosePeekAfterDelete(undefined, "trace-a")).toBe(false);
  });
});
