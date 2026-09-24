import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueueJobs } from "@langfuse/shared/src/server";

const enabled = vi.hoisted(() => vi.fn(() => true));

vi.mock("@langfuse/shared/topics/server", () => ({
  isTopicsProjectEnabled: enabled,
}));

import {
  backfillSelectionFilters,
  enqueueTopicTraceBackfill,
} from "./backfillTopicTraces";

const selection = {
  filter: [],
  from: new Date("2026-09-23T00:00:00.000Z"),
  to: new Date("2026-09-24T00:00:00.000Z"),
  limit: 20,
  sampling: "latest" as const,
  seed: "backfill",
};

describe("backfillSelectionFilters", () => {
  it("maps a trace name and tag onto the Topics observation filters", () => {
    expect(
      backfillSelectionFilters({
        traceNames: ["agent-turn"],
        tags: ["billing"],
        extra: [],
      }),
    ).toEqual([
      {
        column: "traceName",
        type: "stringOptions",
        operator: "any of",
        value: ["agent-turn"],
      },
      {
        column: "tags",
        type: "arrayOptions",
        operator: "any of",
        value: ["billing"],
      },
    ]);
  });
});

describe("enqueueTopicTraceBackfill", () => {
  beforeEach(() => {
    enabled.mockReturnValue(true);
  });

  it("lists the newest matches without enqueueing until apply", async () => {
    const addJob = vi.fn();
    const result = await enqueueTopicTraceBackfill({
      projectId: "project",
      selection,
      apply: false,
      selectTraces: async () => ({
        matchedTraceCount: 4,
        traces: [
          {
            id: "trace-new",
            timestamp: new Date("2026-09-23T09:00:00.000Z"),
            latest: new Date("2026-09-23T09:01:00.000Z"),
          },
        ],
      }),
      addJob,
    });
    expect(result).toMatchObject({
      matched: 4,
      traceIds: ["trace-new"],
      enqueued: 0,
    });
    expect(addJob).not.toHaveBeenCalled();
  });

  it("enqueues one trace-batch job per selected trace", async () => {
    const addJob = vi.fn();
    const result = await enqueueTopicTraceBackfill({
      projectId: "project",
      selection,
      apply: true,
      selectTraces: async () => ({
        matchedTraceCount: 1,
        traces: [
          {
            id: "trace-new",
            timestamp: new Date("2026-09-23T09:00:00.000Z"),
            latest: new Date("2026-09-23T09:01:00.000Z"),
          },
        ],
      }),
      addJob,
    });
    expect(result.enqueued).toBe(1);
    expect(addJob).toHaveBeenCalledTimes(1);
    const [name, data, options] = addJob.mock.calls[0];
    expect(name).toBe(QueueJobs.TraceBatch);
    expect(data.payload.traces).toEqual([
      expect.objectContaining({
        projectId: "project",
        traceId: "trace-new",
        minStart: Date.parse("2026-09-23T09:00:00.000Z"),
        maxStart: Date.parse("2026-09-23T09:01:00.000Z"),
      }),
    ]);
    expect(options.jobId).toMatch(/^[a-f0-9]{64}$/);
  });
});
