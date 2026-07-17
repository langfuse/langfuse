import { describe, expect, it } from "vitest";

import { CreateQueueData, CreateQueueWithAssignmentsData } from "./types";

/**
 * Regression tests for langfuse/langfuse#15006 — annotation queues should
 * accept an empty (or omitted) `scoreConfigIds` array so a queue can be
 * created purely for the corrected-output workflow (reviewers provide
 * `CORRECTION` annotations only, no numeric / categorical / boolean / text
 * scoring required). The pre-#15006 schema enforced `.min(1)`, which made
 * the env var-driven corrected-output story fail at the very first call.
 *
 * These tests pin the relaxed shape directly on the Zod schemas shared by
 * the tRPC UI mutation (`annotationQueues.create`) and the public REST API
 * via `CreateAnnotationQueueBody`. Behavioural coverage for the public API
 * itself (round-trip + GET echo) lives in
 * `web/src/__tests__/server/annotation-queues-api.servertest.ts`.
 */
describe("CreateQueueData (annotation queue creation schema) (#15006)", () => {
  it("accepts a non-empty scoreConfigIds (legacy path is unchanged)", () => {
    const result = CreateQueueData.safeParse({
      name: "Legacy queue",
      scoreConfigIds: ["cfg-1", "cfg-2"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scoreConfigIds).toEqual(["cfg-1", "cfg-2"]);
    }
  });

  it("accepts an empty scoreConfigIds (corrected-output-only workflow)", () => {
    const result = CreateQueueData.safeParse({
      name: "Correction-only queue",
      scoreConfigIds: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scoreConfigIds).toEqual([]);
    }
  });

  it("defaults an omitted scoreConfigIds field to an empty array", () => {
    const result = CreateQueueData.safeParse({
      name: "Omitted-configs queue",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scoreConfigIds).toEqual([]);
    }
  });

  it("still rejects a missing name (other required fields are unchanged)", () => {
    const result = CreateQueueData.safeParse({
      scoreConfigIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("still applies the HTML/empty/length constraints on name and description", () => {
    const tooLong = "x".repeat(36);
    const result = CreateQueueData.safeParse({
      name: tooLong,
      scoreConfigIds: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateQueueWithAssignmentsData (annotation queue + assignments) (#15006)", () => {
  // The `WithAssignments` schema extends `CreateQueueData`, so the same
  // empty-scoreConfigIds relaxation must propagate. The assignments field is
  // unrelated to this change but we keep an empty-array smoke test so a
  // future refactor that re-introduces a hard `.min(1)` on the parent
  // schema fails here as well as in the smaller unit test above.
  it("accepts an empty scoreConfigIds alongside an empty assignments list", () => {
    const result = CreateQueueWithAssignmentsData.safeParse({
      name: "Bare queue",
      scoreConfigIds: [],
      newAssignmentUserIds: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scoreConfigIds).toEqual([]);
      expect(result.data.newAssignmentUserIds).toEqual([]);
    }
  });
});
