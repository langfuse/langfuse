import { describe, it, expect, assert } from "vitest";
import {
  processEventBatch,
  eventTypes,
  propagateTraceUserIds,
} from "@langfuse/shared/src/server";

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

  describe("user ID propagation", () => {
    it("propagates userId from trace to child observations", async () => {
      const projectId = "test-project";
      const traceId = "test-trace-123";
      const userId = "test-user-456";

      // Create test events: trace with userId and child observation without userId
      const events = [
        {
          id: "trace-event-1",
          type: eventTypes.TRACE_CREATE,
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            timestamp: new Date().toISOString(),
            userId,
            name: "Parent Trace",
            metadata: { test: true },
          },
        },
        {
          id: "observation-event-1",
          type: eventTypes.SPAN_CREATE,
          timestamp: new Date().toISOString(),
          body: {
            id: "child-observation-123",
            traceId,
            name: "Child Observation",
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            // No userId - should be propagated from parent trace
          },
        },
      ];

      // Apply user ID propagation
      await propagateTraceUserIds(events, projectId);

      // Verify child observation now has userId
      const childObservation = events.find(
        (e) => e.body.id === "child-observation-123",
      );
      expect(childObservation).toBeDefined();
      expect(childObservation!.body.userId).toBe(userId);
    });
  });
});
