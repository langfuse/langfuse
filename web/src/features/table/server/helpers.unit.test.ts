import { describe, expect, it } from "vitest";
import {
  batchActionMaterialKey,
  batchActionOperationJobId,
  planBatchActionQueueJob,
} from "./helpers";

const baseId = "project-traces-trace-add-to-annotation-queue";
const queryA = { filter: [{ column: "name", value: "QA" }] };
const queryB = { filter: [{ column: "name", value: "QB" }] };

describe("planBatchActionQueueJob", () => {
  it("uses the base id when nothing is retained", () => {
    expect(
      planBatchActionQueueJob({
        baseId,
        query: queryA,
        targetId: "queue-a",
        existing: null,
      }),
    ).toEqual({ jobId: baseId, removeExisting: false });
  });

  it("dedups an identical request that is still running", () => {
    expect(
      planBatchActionQueueJob({
        baseId,
        query: { extra: 1, filter: queryA.filter },
        targetId: "queue-a",
        existing: {
          state: "active",
          query: { filter: queryA.filter, extra: 1 },
          targetId: "queue-a",
        },
      }),
    ).toEqual({ jobId: baseId, removeExisting: false });
  });

  it("replaces a failed job so the next request is not dropped", () => {
    expect(
      planBatchActionQueueJob({
        baseId,
        query: queryB,
        targetId: "queue-b",
        existing: {
          state: "failed",
          query: queryA,
          targetId: "queue-a",
        },
      }),
    ).toEqual({ jobId: baseId, removeExisting: true });
  });

  it("gives a different in-flight request its own job id", () => {
    const plan = planBatchActionQueueJob({
      baseId,
      query: queryB,
      targetId: "queue-b",
      existing: {
        state: "active",
        query: queryA,
        targetId: "queue-a",
      },
    });

    expect(plan.removeExisting).toBe(false);
    expect(plan.jobId).toBe(
      batchActionOperationJobId(baseId, queryB, "queue-b"),
    );
    expect(plan.jobId).not.toBe(baseId);
  });

  it("treats key order and Date values as the same request", () => {
    const at = new Date("2026-07-22T00:00:00.000Z");
    expect(
      batchActionMaterialKey({ b: 1, a: at }, "queue-a"),
    ).toBe(
      batchActionMaterialKey(
        { a: "2026-07-22T00:00:00.000Z", b: 1 },
        "queue-a",
      ),
    );
  });
});
