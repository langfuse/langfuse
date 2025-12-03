import { describe, it, expect, assert } from "vitest";
import { processEventBatch } from "@langfuse/shared/src/server";

describe("processEventBatch", () => {
  it("returns early on empty input", async () => {
    // Auth check with missing projectId will cause an exception unless
    // there is an early return in processEventBatch
    const authCheck = {
      validKey: true as const,
      scope: {
        projectId: null,
        accessLevel: "project" as const,
      },
    };

    assert.doesNotThrow(
      async () => await processEventBatch([], authCheck, {}),
      "UnauthorizedError",
    );

    const res = await processEventBatch([], authCheck, {});
    expect(res.successes).toEqual([]);
    expect(res.errors).toEqual([]);
  });
});
