import { randomUUID } from "node:crypto";
import { type Job } from "bullmq";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTraceBatchEventStream,
  QueueJobs,
  redis,
  type QueueName,
  type TQueueJobTypes,
  type TraceBatchInputStorage,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { EXPERIMENT_RULE_ID } from "../../features/evaluation/traceTranscriptEval/scheduleTraceTranscriptEvals";
import { getTraceBatchShard } from "../../features/traceBatching/traceBatchReadiness";
import {
  ACKNOWLEDGE_RECORDING_SCRIPT,
  getRecordingKeys,
  recordTraceActivity,
} from "../../features/traceBatching/traceRuleRecording";
import { eventsDispatchQueueProcessor } from "../eventsDispatchQueue";

const inputStorage = vi.hoisted(() => ({
  put: vi.fn<TraceBatchInputStorage["put"]>(),
  get: vi.fn<TraceBatchInputStorage["get"]>(),
}));
const topicsTraceAdd = vi.hoisted(() => vi.fn());

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...original,
    redis: original.createNewRedisInstance({
      keyPrefix: `events-dispatch-test-${randomUUID()}:`,
    }),
    getTraceBatchEventStream: vi.fn(),
    recordIncrement: vi.fn(),
    recordDistribution: vi.fn(),
    createTraceBatchInputStorage: () => inputStorage,
    TopicsTraceQueue: { getInstance: () => ({ add: topicsTraceAdd }) },
  };
});

// "rule" runs a Topics facet; recorded IDs without a stored rule are dropped.
vi.mock("@langfuse/shared/src/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/db")>()),
  prisma: {
    evaluationRule: {
      findMany: vi.fn(async () => [
        { id: "rule", assignments: [{ evaluator: { type: "FACET" } }] },
      ]),
    },
  },
}));

const originals = {
  region: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  traceDispatch: env.LANGFUSE_TRACE_DISPATCH_ENABLED,
  eventsDispatch: env.LANGFUSE_EVENTS_DISPATCH_ENABLED,
  storeAll: env.LANGFUSE_EVENTS_DISPATCH_STORE_ALL_TRACES,
};
const MINUTE_MS = 60_000;
// Keys share the local Redis, so each run uses its own project.
const projectId = `project-${randomUUID()}`;
const member = (traceId: string) => JSON.stringify([projectId, traceId]);
const keysOf = (traceId: string) =>
  getRecordingKeys(getTraceBatchShard(member(traceId)));
const readPending = async (traceId: string) => {
  const value = await redis!.hget(keysOf(traceId).pending, member(traceId));
  return value === null ? null : JSON.parse(value);
};

/** Record ingestion activity; acknowledge removes pending state as the dispatcher does after enqueueing. */
async function recordAndAcknowledge(traceIds: string[], acknowledge = true) {
  await recordTraceActivity(
    projectId,
    traceIds.map((traceId) => ({
      traceId,
      spanStartTimeISO: new Date(1_000_000).toISOString(),
      ruleIds: ["rule"],
      serializedEventBytes: 100,
    })),
  );
  const revisions = new Map<string, string>();
  for (const traceId of traceIds) {
    revisions.set(traceId, (await readPending(traceId)).revision);
    if (!acknowledge) continue;
    await redis!.hdel(keysOf(traceId).pending, member(traceId));
    await redis!.zrem(keysOf(traceId).due, member(traceId));
  }
  return revisions;
}

function streamRows(traceIds: string[]) {
  vi.mocked(getTraceBatchEventStream).mockImplementation(async function* () {
    for (const traceId of traceIds)
      yield {
        project_id: projectId,
        trace_id: traceId,
        session_id: "",
        environment: "default",
        span_id: `span-${traceId}`,
        parent_span_id: null,
        start_time: "2026-11-05 00:00:00.000000",
        event_ts: "2026-11-05 00:00:00.000000",
        type: "GENERATION",
        name: "generation",
        input: JSON.stringify([{ role: "user", content: "hello" }]),
        output: "",
        metadata: {},
        level: "DEFAULT",
        status_message: null,
        tool_definitions: {},
        tool_calls: [],
        tool_call_names: [],
      };
  });
}

const job = (
  traces: {
    traceId: string;
    revision: string;
    failedCount?: number;
    ruleIds?: string[];
  }[],
) =>
  ({
    data: {
      id: randomUUID(),
      name: QueueJobs.EventsDispatchJob,
      timestamp: new Date(),
      payload: {
        traces: traces.map((trace) => ({
          projectId,
          minStart: 1_000_000,
          maxStart: 1_000_000,
          ruleIds: ["rule"],
          ...trace,
        })),
      },
    },
    opts: {},
  }) as unknown as Job<TQueueJobTypes[QueueName.EventsDispatch]>;

describe("events dispatch consumer", () => {
  beforeEach(async () => {
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "STAGING";
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = "true";
    env.LANGFUSE_EVENTS_DISPATCH_ENABLED = "true";
    env.LANGFUSE_EVENTS_DISPATCH_STORE_ALL_TRACES = originals.storeAll;
    vi.clearAllMocks();
    inputStorage.put.mockResolvedValue({ outcome: "stored", jsonLength: 10 });
  });

  afterAll(async () => {
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originals.region;
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = originals.traceDispatch;
    env.LANGFUSE_EVENTS_DISPATCH_ENABLED = originals.eventsDispatch;
    env.LANGFUSE_EVENTS_DISPATCH_STORE_ALL_TRACES = originals.storeAll;
    redis?.disconnect();
  });

  it("enqueues stored traces with their recorded rules and returns a failed upload to Redis with backoff", async () => {
    const revisions = await recordAndAcknowledge(["stored", "failed"]);
    streamRows(["failed", "stored"]);
    inputStorage.put.mockImplementation(async ({ traceId }) => {
      if (traceId === "failed") throw new Error("SlowDown");
      return { outcome: "stored", jsonLength: 10 };
    });
    const startedAt = Date.now();

    await eventsDispatchQueueProcessor(
      job([...revisions].map(([traceId, revision]) => ({ traceId, revision }))),
    );

    expect(topicsTraceAdd).toHaveBeenCalledTimes(1);
    expect(topicsTraceAdd.mock.calls[0][1].payload).toEqual({
      projectId,
      traceId: "stored",
      revision: revisions.get("stored"),
      ruleIds: ["rule"],
    });
    expect(await readPending("stored")).toBeNull();
    const restored = await readPending("failed");
    expect(restored).toMatchObject({ rules: ["rule"], failed_cnt: 1 });
    // A fresh revision keeps the retry's transcript separate from the failed attempt.
    expect(restored.revision).not.toBe(revisions.get("failed"));
    const due = Number(
      await redis!.zscore(keysOf("failed").due, member("failed")),
    );
    expect(due).toBeGreaterThanOrEqual(startedAt + 5 * MINUTE_MS - 1_000);
    expect(due).toBeLessThanOrEqual(Date.now() + 5 * MINUTE_MS + 1_000);
  });

  it("keeps newer activity's revision and drops a trace after its last retry", async () => {
    const revisions = await recordAndAcknowledge(["newer", "exhausted"]);
    // New spans arrive for one trace while its job runs.
    await recordTraceActivity(projectId, [
      {
        traceId: "newer",
        spanStartTimeISO: new Date(2_000_000).toISOString(),
        ruleIds: ["other"],
        serializedEventBytes: 100,
      },
    ]);
    const newer = await readPending("newer");
    const newerDue = await redis!.zscore(keysOf("newer").due, member("newer"));
    streamRows(["exhausted", "newer"]);
    inputStorage.put.mockRejectedValue(new Error("SlowDown"));

    await eventsDispatchQueueProcessor(
      job([
        { traceId: "newer", revision: revisions.get("newer")! },
        {
          traceId: "exhausted",
          revision: revisions.get("exhausted")!,
          failedCount: 3,
        },
      ]),
    );

    expect(topicsTraceAdd).not.toHaveBeenCalled();
    expect(await readPending("newer")).toEqual({
      ...newer,
      rules: ["other", "rule"],
    });
    expect(await redis!.zscore(keysOf("newer").due, member("newer"))).toBe(
      newerDue,
    );
    expect(await readPending("exhausted")).toBeNull();
  });

  it("keeps a retry that is restored before the dispatcher acknowledges its revision", async () => {
    const revisions = await recordAndAcknowledge(["early"], false);
    streamRows(["early"]);
    inputStorage.put.mockRejectedValue(new Error("SlowDown"));

    await eventsDispatchQueueProcessor(
      job([{ traceId: "early", revision: revisions.get("early")! }]),
    );
    // The dispatcher's late acknowledgement of the dispatched revision.
    const { due, pending } = keysOf("early");
    await redis!.eval(
      ACKNOWLEDGE_RECORDING_SCRIPT,
      2,
      due,
      pending,
      member("early"),
      revisions.get("early")!,
    );

    const restored = await readPending("early");
    expect(restored).toMatchObject({ rules: ["rule"], failed_cnt: 1 });
    expect(restored.revision).not.toBe(revisions.get("early"));
  });

  it("stores traces without consumer rules only in the store-all experiment, still enqueueing Topics where rules apply", async () => {
    env.LANGFUSE_EVENTS_DISPATCH_STORE_ALL_TRACES = "true";
    streamRows(["marker", "topics"]);

    const result = await eventsDispatchQueueProcessor(
      job([
        {
          traceId: "marker",
          revision: "r1",
          ruleIds: [EXPERIMENT_RULE_ID],
        },
        { traceId: "topics", revision: "r2" },
      ]),
    );

    expect(result).toEqual({ stored: 1, enqueued: 1 });
    expect(inputStorage.put).toHaveBeenCalledTimes(2);
    expect(topicsTraceAdd).toHaveBeenCalledTimes(1);
    expect(topicsTraceAdd.mock.calls[0][1].payload.traceId).toBe("topics");
  });

  it("does not return a failed storage-only trace to Redis, while a failed Topics trace is restored", async () => {
    env.LANGFUSE_EVENTS_DISPATCH_STORE_ALL_TRACES = "true";
    const revisions = await recordAndAcknowledge(["topics"]);
    // Bounds without a pending selection, as recorded for experiment-only traces.
    await recordTraceActivity(projectId, [
      {
        traceId: "marker",
        spanStartTimeISO: new Date(1_000_000).toISOString(),
        ruleIds: [],
        serializedEventBytes: 100,
      },
    ]);
    streamRows(["marker", "topics"]);
    inputStorage.put.mockRejectedValue(new Error("SlowDown"));

    await eventsDispatchQueueProcessor(
      job([
        { traceId: "marker", revision: "r1", ruleIds: [EXPERIMENT_RULE_ID] },
        { traceId: "topics", revision: revisions.get("topics")! },
      ]),
    );

    expect(topicsTraceAdd).not.toHaveBeenCalled();
    expect(await readPending("marker")).toBeNull();
    expect(await readPending("topics")).toMatchObject({
      rules: ["rule"],
      failed_cnt: 1,
    });
  });
});
