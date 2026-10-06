import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import {
  QueueJobs,
  TraceBatchQueue,
  createEvent,
  createEventsCh,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { selectTopicTraceRows } from "@langfuse/shared/topics/server";

const enabled = vi.hoisted(() => vi.fn(() => true));

vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/topics/server")>()),
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

describe("Topics trace selection and backfill", () => {
  const projectId = randomUUID();
  const addJob = vi.fn();
  beforeAll(async () => {
    await createEventsCh(
      [
        [projectId, "trace-new", "2026-09-23T09:00:00Z"],
        [projectId, "trace-new", "2026-09-23T09:01:00Z"],
        [projectId, "trace-old", "2026-09-23T08:00:00Z"],
        [projectId, "trace-outside", "2026-09-24T00:00:00Z"],
        [randomUUID(), "trace-foreign", "2026-09-23T10:00:00Z"],
        [
          projectId,
          "trace-internal",
          "2026-09-23T11:00:00Z",
          "langfuse-topics",
        ],
        [projectId, "trace-judge", "2026-09-23T12:00:00Z", "llm-as-a-judge"],
        [projectId, "trace-reserved", "2026-09-23T13:00:00Z", "langfuse"],
      ].map(([project, trace, timestamp, environment]) =>
        createEvent({
          project_id: project,
          trace_id: trace,
          start_time: new Date(timestamp),
          trace_name: "agent-turn",
          environment: environment ?? "test",
          tags: ["billing"],
        }),
      ),
    );
  });
  beforeEach(() => {
    enabled.mockReturnValue(true);
    addJob.mockReset();
    vi.spyOn(TraceBatchQueue, "getInstance").mockReturnValue({
      add: addJob,
    } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it("deduplicates and orders bounded matches without enqueueing a dry run", async () => {
    const result = await enqueueTopicTraceBackfill({
      projectId,
      selection: { ...selection, limit: 1 },
      apply: false,
    });
    expect(result).toEqual({
      matched: 2,
      traceIds: ["trace-new"],
      enqueued: 0,
    });
    expect(addJob).not.toHaveBeenCalled();
  });

  it("enqueues each selected trace with its matching observation time bounds", async () => {
    const result = await enqueueTopicTraceBackfill({
      projectId,
      selection,
      apply: true,
    });
    expect(result.enqueued).toBe(2);
    expect(addJob).toHaveBeenCalledTimes(2);
    const [name, data, options] = addJob.mock.calls[0];
    expect(name).toBe(QueueJobs.TraceBatch);
    expect(data.payload.traces).toEqual([
      expect.objectContaining({
        projectId,
        traceId: "trace-new",
        minStart: Date.parse("2026-09-23T09:00:00.000Z"),
        maxStart: Date.parse("2026-09-23T09:01:00.000Z"),
      }),
    ]);
    expect(options.jobId).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps preview, ID-only triggers and backfill sampling aligned", async () => {
    const input = {
      ...selection,
      projectId,
      sampling: "random" as const,
      limit: 1,
      filter: backfillSelectionFilters({
        traceNames: ["agent-turn"],
        tags: ["billing"],
        extra: [],
      }),
    };
    const [preview, ids, backfill] = await Promise.all([
      selectTopicTraceRows(input, prisma, "preview"),
      selectTopicTraceRows(input, prisma, "ids"),
      selectTopicTraceRows(input, prisma, "backfill"),
    ]);
    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      name: "agent-turn",
      environment: "test",
    });
    expect(Number(preview[0].matchedTraceCount)).toBe(2);
    expect(ids).toEqual([{ id: preview[0].id }]);
    expect(backfill.map(({ id }) => id)).toEqual(ids.map(({ id }) => id));
  });
});
