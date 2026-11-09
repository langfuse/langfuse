/* eslint-disable @repo/no-exotic-operators */
import calculateSlot from "cluster-key-slot";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Queue, QueueEvents, Worker } from "bullmq";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createNewRedisInstance,
  getQueuePrefix,
  getS3EventStorageClient,
  getTraceBatchEventStream,
  QueueJobs,
  QueueName,
  recordDistribution,
  recordGauge,
  recordIncrement,
  redis,
  TopicsTraceQueue,
  TraceBatchEventSchema,
  TraceBatchQueue,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import * as shared from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";
import { TraceBatchMetricsRunner } from "../features/traceBatching/TraceBatchMetricsRunner";
import {
  ACKNOWLEDGE_SCRIPT,
  getTraceBatchFirstKeys,
  getTraceBatchReadinessKeys,
  getTraceBatchShard,
} from "../features/traceBatching/traceBatchReadiness";
import {
  trackLegacyTopicsBatchActivity,
  TraceBatchDispatcher,
} from "../features/traceBatching/traceBatching";
import {
  getRecordingBoundsKey,
  getRecordingKeys,
  getRecordingTag,
  recordTraceActivity,
} from "../features/traceBatching/traceRuleRecording";
import {
  isTraceBatchSampled,
  resolveTraceBatchSamplingRate,
} from "../features/traceBatching/traceBatchSampling";
import {
  prepareLocalityPartials,
  selectTraceBatches,
  type PendingTrace,
} from "../features/traceBatching/traceBatchSelection";
import { otelIngestionQueueProcessorBuilder } from "../queues/otelIngestionQueue";
import { traceBatchQueueProcessor } from "../queues/traceBatchQueue";
import { topicsTraceQueueProcessorBuilder } from "../queues/topicsTraceQueue";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import {
  ensureDefaultTopicFacets,
  getTopicsProcessingSampling,
  isTopicsProcessingActive,
  isTopicsEnabled,
  listTopicSummaries,
  saveTopicRule,
  type TopicsModels,
} from "@langfuse/shared/topics/server";
import {
  summarizeTopicTraceFacets,
  embedTopicSummaries,
} from "../features/topics/models";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...original,
    redis: original.createNewRedisInstance({
      keyPrefix: `trace-batch-test-${randomUUID()}:`,
    }),
    recordDistribution: vi.fn(),
    recordGauge: vi.fn(),
    recordIncrement: vi.fn(),
    getS3EventStorageClient: vi.fn(),
    getTracingReadinessSettings: vi.fn(original.getTracingReadinessSettings),
  };
});

const topicsProjects = vi.hoisted(() => new Set<string>());
vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/topics/server")>()),
  isTopicsEnabled: vi.fn(() => true),
  isTopicsProjectEnabled: (projectId: string) => topicsProjects.has(projectId),
  isTopicsProcessingActive: vi.fn(async (projectId: string) =>
    topicsProjects.has(projectId),
  ),
  getTopicsProcessingSampling: vi.fn(async (projectId: string) =>
    topicsProjects.has(projectId) ? 1 : 0,
  ),
  getEnabledTopicsModels: async (projectIds: string[]) =>
    new Map(
      projectIds
        .filter((id) => topicsProjects.has(id))
        .map((projectId) => {
          const slot = (
            name: "summary" | "embedding" | "clustering",
            model: string,
          ) => ({
            slot: name,
            provider: "bedrock",
            adapter: "bedrock",
            model,
            connection: { secretKey: "encrypted" },
          });
          return [
            projectId,
            {
              projectId,
              enabled: true,
              summary: slot("summary", "us.openai.gpt-5.6-luna"),
              embedding: {
                ...slot("embedding", "eu.cohere.embed-v4:0"),
                dimensions: 1024,
              },
              clustering: slot("clustering", "us.openai.gpt-5.6-terra"),
            } as TopicsModels,
          ] as const;
        }),
    ),
}));

vi.mock("../features/topics/models", () => ({
  summarizeTopicTraceFacets: vi.fn(),
  embedTopicSummaries: vi.fn(),
}));

vi.mock("../features/evaluation/fetchEvalRules", () => ({
  fetchEvalRules: vi.fn().mockResolvedValue({
    observationRules: [],
    traceTranscriptRules: [],
  }),
}));

describe("trace batch selection", () => {
  const minute = 60_000;
  const pendingTrace = (
    projectId: string,
    traceId: string,
    due: number,
    minStart: number,
    maxStart: number,
  ): PendingTrace => ({
    member: JSON.stringify([projectId, traceId]),
    due,
    trace: {
      projectId,
      traceId,
      minStart,
      maxStart,
      revision: `revision-${projectId}-${traceId}`,
    },
  });
  const ids = (batches: PendingTrace[][]) =>
    batches.map((batch) => batch.map(({ member }) => member));

  it("orders batches by the events table locality key", () => {
    const projectB = pendingTrace("project-b", "trace-1", 1, 0, minute);
    const laterMinute = pendingTrace(
      "project-a",
      "trace-3",
      2,
      2 * minute,
      3 * minute,
    );
    const widerRange = pendingTrace(
      "project-a",
      "trace-4",
      3,
      10_000,
      2 * minute,
    );
    const trace0 = pendingTrace("project-a", "trace-0", 4, 20_000, 50_000);
    const trace1 = pendingTrace("project-a", "trace-1", 5, 10_000, 50_000);

    const batches = selectTraceBatches(
      [projectB, laterMinute, widerRange, trace0, trace1],
      2,
      "locality",
    );

    expect(ids(batches)).toEqual([
      [trace1.member, trace0.member],
      [widerRange.member, laterMinute.member],
      [projectB.member],
    ]);
  });

  it("is independent of readiness and input order", () => {
    const candidates = [
      pendingTrace("project-b", "trace-3", 1, 10 * minute, 11 * minute),
      pendingTrace("project-a", "trace-0", 4, 10 * minute, 11 * minute),
      pendingTrace("project-a", "trace-1", 3, 10 * minute, 11 * minute),
      pendingTrace("project-a", "trace-4", 2, 10 * minute, 11 * minute),
    ];
    const expected = selectTraceBatches(candidates, 3, "locality");

    expect(expected.flat().map(({ trace }) => trace.traceId)).toEqual([
      "trace-1",
      "trace-0",
      "trace-4",
      "trace-3",
    ]);
    expect(selectTraceBatches(candidates.toReversed(), 3, "locality")).toEqual(
      expected,
    );
  });

  it("moves a batch boundary instead of bridging distant time ranges", () => {
    const early = Array.from({ length: 59 }, (_, index) =>
      pendingTrace("project", `early-${index}`, index, 0, minute),
    );
    const late = Array.from({ length: 60 }, (_, index) =>
      pendingTrace(
        "project",
        `late-${index}`,
        100 + index,
        10_000 * minute,
        10_001 * minute,
      ),
    );

    const batches = selectTraceBatches([...late, ...early], 60, "locality");

    expect(batches.map((batch) => batch.length)).toEqual([59, 60]);
    expect(
      batches[0].every(({ trace }) => trace.traceId.startsWith("early-")),
    ).toBe(true);
    expect(
      batches[1].every(({ trace }) => trace.traceId.startsWith("late-")),
    ).toBe(true);
  });

  it("avoids a cross-project fill when the same job count permits it", () => {
    const projectA = Array.from({ length: 59 }, (_, index) =>
      pendingTrace("project-a", `trace-${index}`, index, 0, minute),
    );
    const projectB = Array.from({ length: 60 }, (_, index) =>
      pendingTrace("project-b", `trace-${index}`, 100 + index, 0, minute),
    );

    const batches = selectTraceBatches(
      [...projectB, ...projectA],
      60,
      "locality",
    );

    expect(batches.map((batch) => batch.length)).toEqual([59, 60]);
    expect(
      batches.map(
        (batch) => new Set(batch.map(({ trace }) => trace.projectId)).size,
      ),
    ).toEqual([1, 1]);
  });

  it("cuts at the largest trace-hash gap within one time range", () => {
    const candidates = Array.from({ length: 5 }, (_, index) =>
      pendingTrace("project", `trace-${index}`, index, 0, minute),
    );

    const batches = selectTraceBatches(candidates.toReversed(), 3, "locality");

    expect(
      batches.map((batch) => batch.map(({ trace }) => trace.traceId)),
    ).toEqual([
      ["trace-1", "trace-0"],
      ["trace-4", "trace-2", "trace-3"],
    ]);
  });

  it("splits distant narrow traces rather than sharing one envelope", () => {
    const candidates = Array.from({ length: 3 }, (_, index) =>
      pendingTrace(
        "project",
        `day-${index}`,
        index,
        index * 3 * 60 * minute,
        index * 3 * 60 * minute + minute,
      ),
    );

    expect(ids(selectTraceBatches(candidates, 60, "locality"))).toEqual(
      candidates.map((candidate) => [candidate.member]),
    );
  });

  it("preserves uneven cohorts separated by mandatory envelope boundaries", () => {
    const cohorts = [2, 1, 4, 2].map((size, cohort) =>
      Array.from({ length: size }, (_, index) => {
        const start = (cohort * 120 + index) * minute;
        return pendingTrace(
          "project",
          `cohort-${cohort}-${index}`,
          index,
          start,
          start + minute,
        );
      }),
    );

    for (const cap of [4, 9]) {
      expect(
        ids(selectTraceBatches(cohorts.flat().toReversed(), cap, "locality")),
      ).toEqual(ids(cohorts));
    }
  });

  it("bounds chained wide-trace expansion relative to the batch seed", () => {
    const seed = pendingTrace("project", "seed", 1, 0, 120 * minute);
    const compatible = pendingTrace(
      "project",
      "compatible",
      2,
      0,
      144 * minute,
    );
    const wouldChain = pendingTrace(
      "project",
      "would-chain",
      3,
      0,
      168 * minute,
    );

    const batches = selectTraceBatches(
      [wouldChain, compatible, seed],
      60,
      "locality",
    );

    expect(batches.flat()).toHaveLength(3);
    expect(
      batches.some((batch) => {
        const ids = new Set(batch.map(({ member }) => member));
        return ids.has(seed.member) && ids.has(wouldChain.member);
      }),
    ).toBe(false);
    expect(
      batches.every((batch) => {
        const union =
          Math.max(...batch.map(({ trace }) => trace.maxStart)) -
          Math.min(...batch.map(({ trace }) => trace.minStart));
        const seedSpan = batch[0].trace.maxStart - batch[0].trace.minStart;
        return union <= Math.max(60 * minute, seedSpan * 1.25);
      }),
    ).toBe(true);
  });
  it("coalesces overlapping same-project partials deterministically", () => {
    const early = [
      pendingTrace("project", "early-1", 1, 0, minute),
      pendingTrace("project", "early-2", 2, minute, 2 * minute),
    ];
    const intervening = [
      pendingTrace("project", "late-1", 3, 24 * 60 * minute, 24 * 60 * minute),
    ];
    const compatible = [
      pendingTrace("project", "early-3", 4, 3 * minute, 3 * minute),
    ];

    const forward = prepareLocalityPartials(
      [early, intervening, compatible],
      6,
    );
    const reversed = prepareLocalityPartials(
      [compatible, intervening, early],
      6,
    );

    expect(ids(forward.carry)).toEqual(ids(reversed.carry));
    expect(ids(forward.dispatch)).toEqual(ids(reversed.dispatch));
    expect(forward.dispatch).toEqual([]);
    expect(
      forward.carry.map((batch) =>
        batch.map(({ trace }) => trace.traceId).sort(),
      ),
    ).toEqual([["early-1", "early-2", "early-3"], ["late-1"]]);
  });

  it("bounds locality partial carry without splitting batches", () => {
    const oldest = [
      pendingTrace("project", "oldest-1", 1, 0, 0),
      pendingTrace("project", "oldest-2", 2, 0, 0),
      pendingTrace("project", "oldest-3", 3, 0, 0),
    ];
    const newer = [
      pendingTrace("project", "newer-1", 4, 24 * 60 * minute, 24 * 60 * minute),
      pendingTrace("project", "newer-2", 5, 24 * 60 * minute, 24 * 60 * minute),
      pendingTrace("project", "newer-3", 6, 24 * 60 * minute, 24 * 60 * minute),
    ];

    const result = prepareLocalityPartials([newer, oldest], 6);

    expect(
      result.dispatch.map((batch) =>
        batch.map(({ trace }) => trace.traceId).sort(),
      ),
    ).toEqual([oldest.map(({ trace }) => trace.traceId)]);
    expect(
      result.carry.map((batch) =>
        batch.map(({ trace }) => trace.traceId).sort(),
      ),
    ).toEqual([newer.map(({ trace }) => trace.traceId)]);
    expect(result.carry.flat()).toHaveLength(3);
    expect(result.carry.flat().length).toBeLessThanOrEqual(5);
  });

  it("breaks equal-increase coalescing ties by canonical order", () => {
    const candidates = [
      pendingTrace("project", "trace-1", 1, 0, 0),
      pendingTrace("project", "trace-2", 1, 0, 0),
      pendingTrace("project", "trace-3", 1, 0, 0),
    ];
    const canonical = selectTraceBatches(candidates, 3, "locality")[0];

    const result = prepareLocalityPartials(
      candidates.toReversed().map((candidate) => [candidate]),
      2,
    );

    expect(result.dispatch).toHaveLength(1);
    expect(ids(result.dispatch)).toEqual([
      canonical.slice(0, 2).map(({ member }) => member),
    ]);
    expect(ids(result.carry)).toEqual([
      canonical.slice(2).map(({ member }) => member),
    ]);
  });

  it("does not coalesce incompatible partials or exceed the trace cap", () => {
    const wide = [
      pendingTrace("project", "wide", 1, 0, 120 * minute),
      pendingTrace("project", "wide-neighbor", 2, 121 * minute, 121 * minute),
    ];
    const otherProject = [
      pendingTrace("other", "same-window", 3, 121 * minute, 121 * minute),
    ];
    const distant = [
      pendingTrace("project", "distant", 4, 24 * 60 * minute, 24 * 60 * minute),
    ];
    const atCapacity = Array.from({ length: 5 }, (_, index) =>
      pendingTrace("capacity", `trace-${index}`, 10 + index, 0, 0),
    );
    const wouldOverflow = [
      pendingTrace("capacity", "overflow", 20, minute, minute),
    ];

    const result = prepareLocalityPartials(
      [otherProject, distant, wouldOverflow, wide, atCapacity],
      5,
    );
    const all = [...result.dispatch, ...result.carry];

    expect(
      all.some(
        (batch) =>
          batch.some(({ trace }) => trace.traceId === "wide") &&
          batch.some(({ trace }) => trace.traceId === "wide-neighbor"),
      ),
    ).toBe(true);
    expect(
      all.some(
        (batch) =>
          batch.some(({ trace }) => trace.traceId === "wide") &&
          batch.some(({ trace }) => trace.projectId === "other"),
      ),
    ).toBe(false);
    expect(
      all.some(
        (batch) =>
          batch.some(({ trace }) => trace.traceId === "wide") &&
          batch.some(({ trace }) => trace.traceId === "distant"),
      ),
    ).toBe(false);
    expect(
      all.some(
        (batch) =>
          batch.some(({ trace }) => trace.traceId === "overflow") &&
          batch.some(({ trace }) => trace.traceId === "trace-0"),
      ),
    ).toBe(false);
    expect(all.every((batch) => batch.length <= 5)).toBe(true);
    expect(new Set(all.flat().map(({ member }) => member)).size).toBe(10);
  });

  describe("weight limits", () => {
    const weighted = (
      traceId: string,
      eventUpdateCount: number,
      serializedEventBytes = eventUpdateCount * 1_000,
    ): PendingTrace => ({
      ...pendingTrace("project", traceId, 1, 0, minute),
      estimates: { eventUpdateCount, serializedEventBytes },
    });
    const limits = { maxEventUpdates: 10, maxSerializedEventBytes: 50_000 };
    const weightOf = (batch: PendingTrace[]) =>
      batch.reduce(
        (total, { estimates }) => ({
          events: total.events + (estimates?.eventUpdateCount ?? 0),
          bytes: total.bytes + (estimates?.serializedEventBytes ?? 0),
        }),
        { events: 0, bytes: 0 },
      );

    it.each(["project", "locality"] as const)(
      "closes %s batches before the event or byte budget and isolates overweight traces",
      (strategy) => {
        const candidates = [
          weighted("a", 4),
          weighted("b", 4),
          weighted("c", 4),
          weighted("heavy", 25),
          weighted("bytes-1", 1, 30_000),
          weighted("bytes-2", 1, 30_000),
          { ...pendingTrace("project", "unknown", 1, 0, minute) },
        ];

        const batches = selectTraceBatches(candidates, 60, strategy, limits);

        expect(batches.flat()).toHaveLength(candidates.length);
        for (const batch of batches) {
          if (batch.length === 1) continue;
          const { events, bytes } = weightOf(batch);
          expect(events).toBeLessThanOrEqual(limits.maxEventUpdates);
          expect(bytes).toBeLessThanOrEqual(limits.maxSerializedEventBytes);
        }
        expect(
          batches.find((batch) =>
            batch.some(({ trace }) => trace.traceId === "heavy"),
          ),
        ).toHaveLength(1);
        expect(
          batches.some(
            (batch) =>
              batch.some(({ trace }) => trace.traceId === "bytes-1") &&
              batch.some(({ trace }) => trace.traceId === "bytes-2"),
          ),
        ).toBe(false);
        // Without budgets the same candidates fit one batch.
        expect(selectTraceBatches(candidates, 60, strategy)).toHaveLength(1);
      },
    );

    it("packs light locality neighbors of a heavy trace into full batches", () => {
      const at = (
        traceId: string,
        start: number,
        eventUpdateCount: number,
      ): PendingTrace => ({
        ...pendingTrace("project", traceId, 1, start, start),
        estimates: {
          eventUpdateCount,
          serializedEventBytes: eventUpdateCount * 1_000,
        },
      });
      // Locality order: two light traces, the heavy trace, six light traces.
      const candidates = [
        at("light-0", 0, 1),
        at("light-1", 0, 1),
        at("heavy", minute, 9),
        ...Array.from({ length: 6 }, (_, index) =>
          at(`light-${index + 2}`, 2 * minute, 1),
        ),
      ];

      const batches = selectTraceBatches(candidates, 4, "locality", limits);

      expect(batches.flat()).toHaveLength(candidates.length);
      expect(batches).toHaveLength(3);
      expect(
        batches.find((batch) =>
          batch.some(({ trace }) => trace.traceId === "heavy"),
        ),
      ).toHaveLength(1);
    });

    it("does not coalesce locality partials past the weight budget", () => {
      const result = prepareLocalityPartials(
        [[weighted("a", 6)], [weighted("b", 6)], [weighted("c", 4)]],
        60,
        limits,
      );
      const all = [...result.dispatch, ...result.carry];

      expect(all.flat()).toHaveLength(3);
      expect(all.every((batch) => weightOf(batch).events <= 10)).toBe(true);
      expect(all).toHaveLength(2);
    });
  });
});

describe("trace-dispatch shard tags", () => {
  it("places each shard's hash tag in its own share of the cluster slot space", () => {
    const originalCount = env.LANGFUSE_TRACE_BATCH_SHARD_COUNT;
    env.LANGFUSE_TRACE_BATCH_SHARD_COUNT = 16;
    try {
      const tags = Array.from({ length: 16 }, (_, shard) =>
        getRecordingTag(shard),
      );
      expect(new Set(tags).size).toBe(16);
      tags.forEach((tag, shard) => {
        expect(tag).toMatch(/^\{trace-dispatch:\d+:[0-9a-z]+\}$/);
        const offset = calculateSlot(tag) - shard * 1_024;
        expect(offset).toBeGreaterThanOrEqual(384);
        expect(offset).toBeLessThan(640);
      });
    } finally {
      env.LANGFUSE_TRACE_BATCH_SHARD_COUNT = originalCount;
    }
  });
});

describe("trace micro-batch scheduling with Redis", () => {
  const { due: dueKey, state: stateKey } = getTraceBatchReadinessKeys(0);
  // Recording tags depend on the shard count; these tests run with one shard.
  const originalShards = env.LANGFUSE_TRACE_BATCH_SHARD_COUNT;
  env.LANGFUSE_TRACE_BATCH_SHARD_COUNT = 1;
  const recordingKeys = getRecordingKeys(0);
  const recordingBoundsKeys = new Map<number, Buffer[]>();
  const originalDispatchEnabled = env.LANGFUSE_TRACE_DISPATCH_ENABLED;
  const originalDispatchSamplingRate =
    env.LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE;
  const originalBoundsTtl = env.LANGFUSE_TRACE_DISPATCH_BOUNDS_TTL_MS;
  const originalEnabled = env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED;
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalDispatcherEnabled = env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED;
  const originalConsumerEnabled =
    env.QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED;
  const originalReadEnabled = env.LANGFUSE_TRACE_BATCH_READ_ENABLED;
  const originalSamplingRate = env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE;
  const originalStrategy = env.LANGFUSE_TRACE_BATCH_STRATEGY;
  const originalMaxSize = env.LANGFUSE_TRACE_BATCH_MAX_SIZE;
  const originalMaxBatchBytes =
    env.LANGFUSE_TRACE_BATCH_MAX_BATCH_SERIALIZED_BYTES;
  const originalPendingTtl = env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS;
  const originalIdle = env.LANGFUSE_TRACE_BATCH_IDLE_MS;
  const originalFirstTtl = env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS;
  const originalMaxTraceEventUpdates =
    env.LANGFUSE_TRACE_BATCH_MAX_TRACE_EVENT_UPDATES;
  const originalMaxTraceBytes =
    env.LANGFUSE_TRACE_BATCH_MAX_TRACE_SERIALIZED_BYTES;
  let queue: Queue<TQueueJobTypes[QueueName.TraceBatch]>;
  let connection: NonNullable<ReturnType<typeof createNewRedisInstance>>;
  const runners: TraceBatchDispatcher[] = [];
  const client = () => {
    if (!redis) throw new Error("Redis is required for this test");
    return redis;
  };
  async function recordActivity(
    projectId: string,
    activity: Parameters<typeof recordTraceActivity>[1],
  ) {
    for (const { traceId } of activity) {
      const identity = JSON.stringify([projectId, traceId]);
      const shard = getTraceBatchShard(identity);
      const keys = recordingBoundsKeys.get(shard) ?? [];
      keys.push(getRecordingBoundsKey(shard, identity));
      recordingBoundsKeys.set(shard, keys);
    }
    await recordTraceActivity(projectId, activity);
  }
  async function readRecordedBounds(identity: string) {
    const key = getRecordingBoundsKey(getTraceBatchShard(identity), identity);
    const value = (await client().eval(
      `local value = redis.call('GET', KEYS[1])
       if value then return cmsgpack.unpack(value) end`,
      1,
      key,
    )) as [number, number, number] | null;
    if (!value) throw new Error(`Missing recorded bounds for ${identity}`);
    const [minStart, maxStart, serializedEventBytes] = value;
    return { key, value: { minStart, maxStart, serializedEventBytes } };
  }
  const member = (projectId: string, traceId: string) =>
    JSON.stringify([projectId, traceId]);
  const event = (
    traceId: string,
    start = 1_000_000,
    serializedEventBytes = 100,
  ) => ({
    traceId,
    startTimeISO: new Date(start).toISOString(),
    serializedEventBytes,
  });
  const spanActivity = (
    traceId: string,
    start = 1_000_000,
    serializedEventBytes = 100,
  ) => ({
    traceId,
    spanStartTimeISO: new Date(start).toISOString(),
    serializedEventBytes,
  });
  const runner = () => {
    const instance = new TraceBatchDispatcher();
    runners.push(instance);
    return instance;
  };
  async function makeDue(projectId: string, ...traceIds: string[]) {
    for (const traceId of traceIds)
      await client().zadd(
        dueKey,
        Date.now() - 10_000,
        member(projectId, traceId),
      );
  }

  async function clearReadiness() {
    // Redis Cluster rejects multi-key commands across hash tags; delete per slot.
    for (const keys of recordingBoundsKeys.values())
      await client().del(...keys);
    recordingBoundsKeys.clear();
    for (let shard = 0; shard < env.LANGFUSE_TRACE_BATCH_SHARD_COUNT; shard++) {
      const keys = getTraceBatchReadinessKeys(shard);
      const recording = getRecordingKeys(shard);
      await client().del(recording.due, recording.pending);
      await client().del(
        keys.due,
        keys.state,
        ...getTraceBatchFirstKeys(shard, Date.now()).keys,
      );
    }
    await client().del("{trace-batch}:dispatcher");
    await client().del("{trace-dispatch}:dispatcher");
  }

  beforeEach(async () => {
    topicsProjects.clear();
    for (const projectId of [
      "project",
      "other",
      "project-a",
      "project-b",
      "project-c",
      "warm-up",
    ])
      topicsProjects.add(projectId);
    vi.mocked(isTopicsEnabled).mockReturnValue(true);
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = "false";
    env.LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE = 0;
    env.LANGFUSE_TRACE_DISPATCH_BOUNDS_TTL_MS = 86_400_000;
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED = "true";
    env.QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED = "false";
    env.LANGFUSE_TRACE_BATCH_READ_ENABLED = "true";
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "true";
    env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = 1;
    env.LANGFUSE_TRACE_BATCH_STRATEGY = "project";
    env.LANGFUSE_TRACE_BATCH_MAX_SIZE = 60;
    env.LANGFUSE_TRACE_BATCH_IDLE_MS = 600_000;
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = 7_200_000;
    env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS = 86_400_000;
    env.LANGFUSE_TRACE_BATCH_SHARD_COUNT = 1;
    // The unset default is 2 minutes on DEV; pin the production idle time.
    env.LANGFUSE_TRACE_BATCH_IDLE_MS = 600_000;
    await clearReadiness();
    const redisConnection = createNewRedisInstance();
    if (!redisConnection) throw new Error("Redis is required for this test");
    connection = redisConnection;
    const name = `trace-batch-test-${randomUUID()}`;
    queue = new Queue(name, { connection, prefix: getQueuePrefix(name) });
    await queue.waitUntilReady();
    vi.spyOn(TraceBatchQueue, "getInstance").mockReturnValue(queue);
  });

  afterEach(async () => {
    for (const dispatcher of runners) await dispatcher.drain();
    runners.length = 0;
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(shared.getTracingReadinessSettings).mockReset();
    await clearReadiness();
    topicsProjects.clear();
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = originalDispatchEnabled;
    env.LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE = originalDispatchSamplingRate;
    env.LANGFUSE_TRACE_DISPATCH_BOUNDS_TTL_MS = originalBoundsTtl;
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = originalEnabled;
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED = originalDispatcherEnabled;
    env.QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED = originalConsumerEnabled;
    env.LANGFUSE_TRACE_BATCH_READ_ENABLED = originalReadEnabled;
    env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = originalSamplingRate;
    env.LANGFUSE_TRACE_BATCH_STRATEGY = originalStrategy;
    env.LANGFUSE_TRACE_BATCH_MAX_SIZE = originalMaxSize;
    env.LANGFUSE_TRACE_BATCH_MAX_BATCH_SERIALIZED_BYTES = originalMaxBatchBytes;
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = originalPendingTtl;
    env.LANGFUSE_TRACE_BATCH_IDLE_MS = originalIdle;
    env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS = originalFirstTtl;
    env.LANGFUSE_TRACE_BATCH_SHARD_COUNT = originalShards;
    env.LANGFUSE_TRACE_BATCH_MAX_TRACE_EVENT_UPDATES =
      originalMaxTraceEventUpdates;
    env.LANGFUSE_TRACE_BATCH_MAX_TRACE_SERIALIZED_BYTES = originalMaxTraceBytes;
    await queue.obliterate({ force: true });
    await queue.close();
    connection.disconnect();
  });
  afterAll(() => client().disconnect());

  it("refreshes only the active trace's bounds TTL and preserves selections on nonmatching activity", async () => {
    vi.mocked(shared.getTracingReadinessSettings).mockResolvedValue({
      traceIdleMs: null,
    });
    const identity = member("project", "recorded");
    const start = Date.parse("2026-11-03T10:00:00.000Z");
    await recordActivity("project", [
      { ...spanActivity("recorded", start, 40), ruleIds: ["existing-rule"] },
      { ...spanActivity("idle", start, 10), ruleIds: [] },
    ]);
    const key = getRecordingBoundsKey(0, identity);
    const idleKey = getRecordingBoundsKey(0, member("project", "idle"));
    await client().pexpire(key, 10_000);
    await client().pexpire(idleKey, 10_000);
    const idleExpiry = await client().pexpiretime(idleKey);
    await client().hset(
      recordingKeys.pending,
      identity,
      JSON.stringify({
        revision: "old",
        rules: ["existing-rule"],
        failed_cnt: 2,
      }),
    );
    const before = Date.now();
    await recordActivity("project", [
      { ...spanActivity("recorded", start + 1_000_000, 25), ruleIds: [] },
    ]);

    expect(await readRecordedBounds(identity)).toEqual({
      key,
      value: {
        minStart: start,
        maxStart: start + 1_000_000,
        serializedEventBytes: 65,
      },
    });
    const expiry = Number(await client().pexpiretime(key));
    expect(expiry).toBeGreaterThanOrEqual(
      before + env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS,
    );
    expect(expiry).toBeLessThanOrEqual(
      Date.now() + env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS,
    );
    expect(await client().pexpiretime(idleKey)).toBe(idleExpiry);
    const record = JSON.parse(
      (await client().hget(recordingKeys.pending, identity))!,
    );
    expect(record).toEqual({
      revision: expect.any(String),
      rules: ["existing-rule"],
      failed_cnt: 2,
    });
    expect(record.revision).not.toBe("old");
    expect(
      Number(await client().zscore(recordingKeys.due, identity)),
    ).toBeGreaterThanOrEqual(before + env.LANGFUSE_TRACE_BATCH_IDLE_MS);
  });

  it("uses the capped project idle time when recording matches and later nonmatching spans", async () => {
    vi.mocked(shared.getTracingReadinessSettings).mockResolvedValue({
      traceIdleMs: 120_000,
    });
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = 90_000;
    const idleMs =
      env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS -
      env.LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS;
    const identity = member("project", "recorded");
    // Due times come from the Redis clock, which can differ from Date.now().
    const redisNow = async () => {
      const [seconds, microseconds] = await client().time();
      return Number(seconds) * 1_000 + Math.floor(Number(microseconds) / 1_000);
    };
    const before = await redisNow();
    await recordActivity("project", [
      { ...spanActivity("recorded"), ruleIds: ["rule"] },
    ]);
    const due = Number(await client().zscore(recordingKeys.due, identity));
    expect(due).toBeGreaterThanOrEqual(before + idleMs);
    expect(due).toBeLessThanOrEqual((await redisNow()) + idleMs);
    const record = JSON.parse(
      (await client().hget(recordingKeys.pending, identity))!,
    );

    // Emulate a deadline approaching without waiting for the idle interval.
    await client().zadd(recordingKeys.due, Date.now() - 1_000, identity);
    const later = Date.now();
    await recordActivity("project", [
      { ...spanActivity("recorded", 2_000_000), ruleIds: [] },
    ]);
    expect(
      Number(await client().zscore(recordingKeys.due, identity)),
    ).toBeGreaterThanOrEqual(later + idleMs);
    const refreshed = JSON.parse(
      (await client().hget(recordingKeys.pending, identity))!,
    );
    expect(refreshed).toEqual({
      revision: expect.any(String),
      rules: ["rule"],
      failed_cnt: 0,
    });
    expect(refreshed.revision).not.toBe(record.revision);
  });

  it("merges bounds and selected rules from concurrent recording batches", async () => {
    vi.mocked(shared.getTracingReadinessSettings).mockResolvedValue({
      traceIdleMs: null,
    });
    const identity = member("project", "recorded");
    await recordActivity("project", [
      { ...spanActivity("recorded", 1_000_000, 10), ruleIds: [] },
    ]);
    expect(await client().hget(recordingKeys.pending, identity)).toBeNull();
    expect(await client().zscore(recordingKeys.due, identity)).toBeNull();

    await Promise.all([
      recordActivity("project", [
        { ...spanActivity("recorded", 2_000_000, 20), ruleIds: ["rule-a"] },
        { ...spanActivity("recorded", 4_000_000, 30), ruleIds: ["rule-a"] },
      ]),
      recordActivity("project", [
        {
          ...spanActivity("recorded", 500_000, 40),
          ruleIds: ["rule-b", "rule-a"],
        },
      ]),
    ]);
    const bounds = await readRecordedBounds(identity);
    expect(bounds.value).toMatchObject({
      minStart: 500_000,
      maxStart: 4_000_000,
      serializedEventBytes: 100,
    });
    const record = JSON.parse(
      (await client().hget(recordingKeys.pending, identity))!,
    );
    expect(record.rules.sort()).toEqual(["rule-a", "rule-b"]);
    expect(await client().zscore(recordingKeys.due, identity)).not.toBeNull();
  });

  it("adds serialized event bytes across later batches", async () => {
    vi.mocked(shared.getTracingReadinessSettings).mockResolvedValue({
      traceIdleMs: null,
    });
    const identity = member("project", "recorded");
    const readBounds = async () => (await readRecordedBounds(identity)).value;
    await recordActivity("project", [
      { ...spanActivity("recorded", 1_000_000, 10), ruleIds: ["rule"] },
    ]);
    expect((await readBounds()).serializedEventBytes).toBe(10);

    await recordActivity("project", [
      { ...spanActivity("recorded", 1_000_000, 20), ruleIds: [] },
      { ...spanActivity("recorded", 2_000_000, 30), ruleIds: [] },
    ]);
    expect((await readBounds()).serializedEventBytes).toBe(60);
    await recordActivity("project", [
      { ...spanActivity("recorded", 1_000_000, 40), ruleIds: [] },
    ]);
    expect((await readBounds()).serializedEventBytes).toBe(100);
  });

  it.each(["bounds", "pending"])(
    "does not revive selections after %s expiry on a late arrival",
    async (expired) => {
      vi.spyOn(shared, "getTracingReadinessSettings").mockResolvedValue({
        traceIdleMs: null,
      });
      const identity = member("project", "recorded");
      await recordActivity("project", [
        { ...spanActivity("recorded", 1_000_000, 80), ruleIds: ["old-rule"] },
      ]);
      if (expired === "bounds") {
        // Bounds may expire while the record is still pending.
        await client().pexpireat((await readRecordedBounds(identity)).key, 1);
      } else {
        await client().zadd(recordingKeys.due, 1, identity);
      }

      await recordActivity("project", [
        { ...spanActivity("recorded", 2_000_000, 50), ruleIds: [] },
      ]);
      const bounds = (await readRecordedBounds(identity)).value;
      // Expired bounds restart the byte total; pending expiry alone keeps the history.
      expect(bounds).toMatchObject({
        minStart: expired === "bounds" ? 2_000_000 : 1_000_000,
        maxStart: 2_000_000,
        serializedEventBytes: expired === "bounds" ? 50 : 130,
      });
      expect(await client().hget(recordingKeys.pending, identity)).toBeNull();
      expect(await client().zscore(recordingKeys.due, identity)).toBeNull();
    },
  );

  it("cleans abandoned selections during ingestion without consuming them", async () => {
    vi.spyOn(shared, "getTracingReadinessSettings").mockResolvedValue({
      traceIdleMs: null,
    });
    const expired = Array.from({ length: 101 }, (_, i) => ({
      ...spanActivity(`recorded-${i}`),
      ruleIds: ["rule"],
    }));
    await recordActivity("project", [
      ...expired,
      { ...spanActivity("refreshed"), ruleIds: ["rule"] },
    ]);
    await client().zadd(
      recordingKeys.due,
      ...expired.flatMap(({ traceId }) => [1, member("project", traceId)]),
    );
    env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED = "false";
    // Each write reclaims at most 100 pending entries.
    for (let i = 0; i < 2; i++) {
      await recordActivity("project", [
        { ...spanActivity("refreshed", 2_000_000), ruleIds: [] },
      ]);
    }
    expect(await client().hkeys(recordingKeys.pending)).toEqual([
      member("project", "refreshed"),
    ]);
    expect(await client().zrange(recordingKeys.due, 0, -1)).toEqual([
      member("project", "refreshed"),
    ]);
    // Cleaning a pending selection must preserve its bounds for late arrivals.
    expect(
      (await readRecordedBounds(member("project", expired[0].traceId))).value,
    ).toMatchObject({ minStart: 1_000_000 });
    expect(await queue.getWaitingCount()).toBe(0);
  });

  it("expires recording keys without a dispatcher and preserves later pending deadlines", async () => {
    vi.spyOn(shared, "getTracingReadinessSettings").mockResolvedValue({
      traceIdleMs: null,
    });
    env.LANGFUSE_TRACE_BATCH_IDLE_MS = 200;
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = 100;
    env.LANGFUSE_TRACE_DISPATCH_BOUNDS_TTL_MS = 100;
    await recordActivity("project", [
      { ...spanActivity("first"), ruleIds: ["rule"] },
    ]);
    const deadline = Number(
      await client().call("PEXPIRETIME", recordingKeys.due),
    );
    expect(deadline).toBeGreaterThan(Date.now());
    env.LANGFUSE_TRACE_BATCH_IDLE_MS = 1;
    await recordActivity("project", [
      { ...spanActivity("second"), ruleIds: ["rule"] },
    ]);
    expect(Number(await client().call("PEXPIRETIME", recordingKeys.due))).toBe(
      deadline,
    );
    expect(
      Number(await client().call("PEXPIRETIME", recordingKeys.pending)),
    ).toBe(deadline);
    const keys = [
      ...Object.values(recordingKeys),
      ...[...recordingBoundsKeys.values()].flat(),
    ];
    await vi.waitFor(async () => {
      expect(await client().exists(...keys)).toBe(0);
    });
  });

  it("dispatches recording maps across shards with bounded reads and leaves legacy maps unchanged", async () => {
    await trackLegacyTopicsBatchActivity("project", [event("legacy")]);
    await makeDue("project", "legacy");
    const legacyState = await client().hgetall(stateKey);
    const legacyDue = await client().zrange(dueKey, 0, -1, "WITHSCORES");
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = "true";
    env.LANGFUSE_TRACE_BATCH_SHARD_COUNT = 2;
    vi.mocked(isTopicsEnabled).mockReturnValue(false);
    const traces = Array.from(
      { length: 60 },
      (_, index) => `recorded-${index}`,
    );
    await recordActivity(
      "project",
      traces.map((traceId) => ({
        ...spanActivity(traceId),
        ruleIds: ["rule"],
      })),
    );
    for (const traceId of traces) {
      const identity = member("project", traceId);
      await client().zadd(
        getRecordingKeys(getTraceBatchShard(identity)).due,
        Date.now() - 1_000,
        identity,
      );
    }
    const ranges = vi.spyOn(client(), "zrange");
    await runner().processBatch();
    const [job] = await queue.getJobs(["wait"]);
    expect(
      job.data.payload.traces.map(({ traceId }) => traceId).sort(),
    ).toEqual(traces.sort());
    // Recorded rule selections reach the consumer without another lookup.
    for (const trace of job.data.payload.traces)
      expect(trace).toMatchObject({ ruleIds: ["rule"], failedCount: 0 });
    expect(await queue.getWaitingCount()).toBe(1);
    for (let shard = 0; shard < 2; shard++) {
      const keys = getRecordingKeys(shard);
      const reads = ranges.mock.calls.filter(
        (args) => args[0] === keys.due && args.includes("BYSCORE"),
      );
      expect(reads).toHaveLength(1);
      expect(
        reads[0].slice(
          reads[0].indexOf("LIMIT"),
          reads[0].indexOf("LIMIT") + 3,
        ),
      ).toEqual(["LIMIT", 0, 10_000]);
      expect(await client().hlen(keys.pending)).toBe(0);
      expect(await client().zcard(keys.due)).toBe(0);
    }
    expect(await client().hgetall(stateKey)).toEqual(legacyState);
    expect(await client().zrange(dueKey, 0, -1, "WITHSCORES")).toEqual(
      legacyDue,
    );
    const retained = await Promise.all(
      traces.map((traceId) => {
        const identity = member("project", traceId);
        return client().exists(
          getRecordingBoundsKey(getTraceBatchShard(identity), identity),
        );
      }),
    );
    expect(retained.reduce((total, count) => total + count, 0)).toBe(
      traces.length,
    );
  });

  it("preserves a newer recording revision during enqueue and retains bounds after acknowledgement", async () => {
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = "true";
    const identity = member("project", "recorded");
    await recordActivity("project", [
      { ...spanActivity("recorded", 1_000, 10), ruleIds: ["rule"] },
    ]);
    await client().zadd(recordingKeys.due, Date.now() - 1_000, identity);
    const add = queue.add.bind(queue);
    vi.spyOn(queue, "add").mockImplementationOnce(async (...args) => {
      const job = await add(...args);
      await recordActivity("project", [
        { ...spanActivity("recorded", 2_000, 20), ruleIds: [] },
      ]);
      return job;
    });
    const dispatcher = runner();
    await dispatcher.processBatch();
    const [first] = await queue.getJobs(["wait"]);
    const current = JSON.parse(
      (await client().hget(recordingKeys.pending, identity))!,
    );
    expect(current.revision).not.toBe(first.data.payload.traces[0].revision);
    expect(await client().zcard(recordingKeys.due)).toBe(1);
    const bounds = await readRecordedBounds(identity);
    expect(bounds.value).toEqual({
      minStart: 1_000,
      maxStart: 2_000,
      serializedEventBytes: 30,
    });
    const expiresAt = await client().pexpiretime(bounds.key);
    await client().zadd(recordingKeys.due, Date.now() - 1_000, identity);
    await dispatcher.processBatch();
    expect(await queue.getWaitingCount()).toBe(2);
    expect(await client().hget(recordingKeys.pending, identity)).toBeNull();
    expect(await client().zscore(recordingKeys.due, identity)).toBeNull();
    expect(await readRecordedBounds(identity)).toEqual(bounds);
    expect(await client().pexpiretime(bounds.key)).toBe(expiresAt);
  });

  it("keeps recording state on enqueue failure and retries it", async () => {
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = "true";
    const identity = member("project", "recorded");
    await recordActivity("project", [
      { ...spanActivity("recorded"), ruleIds: ["rule"] },
    ]);
    await client().zadd(recordingKeys.due, Date.now() - 1_000, identity);
    const record = await client().hget(recordingKeys.pending, identity);
    const bounds = await readRecordedBounds(identity);
    vi.spyOn(queue, "add").mockRejectedValueOnce(
      new Error("enqueue unavailable"),
    );
    const dispatcher = runner();
    await dispatcher.processBatch();
    expect(await client().hget(recordingKeys.pending, identity)).toBe(record);
    expect(await client().zcard(recordingKeys.due)).toBe(1);
    expect(await readRecordedBounds(identity)).toEqual(bounds);
    await dispatcher.processBatch();
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().hget(recordingKeys.pending, identity)).toBeNull();
    expect(await client().zcard(recordingKeys.due)).toBe(0);
  });

  it("revalidates recording readiness and removes missing-record and missing-bounds orphans", async () => {
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = "true";
    const traces = ["missing-record", "missing-bounds", "reactivated", "ready"];
    await recordActivity(
      "project",
      traces.map((traceId) => ({
        ...spanActivity(traceId),
        ruleIds: ["rule"],
      })),
    );
    await client().zadd(
      recordingKeys.due,
      ...traces.flatMap((traceId) => [
        Date.now() - 1_000,
        member("project", traceId),
      ]),
    );
    const range = client().zrange.bind(client());
    let changed = false;
    vi.spyOn(client(), "zrange").mockImplementation(async (...args) => {
      const result = await range(...args);
      if (
        !changed &&
        args[0] === recordingKeys.due &&
        args.includes("BYSCORE")
      ) {
        changed = true;
        await client().hdel(
          recordingKeys.pending,
          member("project", "missing-record"),
        );
        await client().del(
          getRecordingBoundsKey(0, member("project", "missing-bounds")),
        );
        await recordActivity("project", [
          { ...spanActivity("reactivated", 2_000_000), ruleIds: [] },
        ]);
      }
      return result;
    });
    await runner().processBatch();
    expect(changed).toBe(true);
    const jobs = await queue.getJobs(["wait"]);
    expect(
      jobs.flatMap((job) =>
        job.data.payload.traces.map(({ traceId }) => traceId),
      ),
    ).toEqual(["ready"]);
    expect(jobs[0].data.payload.traces[0]).toMatchObject({
      minStart: 1_000_000,
      maxStart: 1_000_000,
    });
    expect(await client().hkeys(recordingKeys.pending)).toEqual([
      member("project", "reactivated"),
    ]);
    expect(await client().zrange(recordingKeys.due, 0, -1)).toEqual([
      member("project", "reactivated"),
    ]);
  });

  it.each(["project", "locality"] as const)(
    "uses recorded bytes without event counts for %s batch and trace limits",
    async (strategy) => {
      env.LANGFUSE_TRACE_DISPATCH_ENABLED = "true";
      env.LANGFUSE_TRACE_BATCH_STRATEGY = strategy;
      env.LANGFUSE_TRACE_BATCH_MAX_BATCH_SERIALIZED_BYTES = 100;
      env.LANGFUSE_TRACE_BATCH_MAX_TRACE_SERIALIZED_BYTES = 100;
      await recordActivity("project", [
        { ...spanActivity("first", 1_000, 60), ruleIds: ["rule"] },
        { ...spanActivity("second", 1_000, 60), ruleIds: ["rule"] },
        { ...spanActivity("oversized", 1_000, 101), ruleIds: ["rule"] },
      ]);
      await client().zadd(
        recordingKeys.due,
        ...["first", "second", "oversized"].flatMap((traceId) => [
          Date.now() - 1_000,
          member("project", traceId),
        ]),
      );
      await runner().processBatch();
      const jobs = await queue.getJobs(["wait"]);
      expect(jobs.map((job) => job.data.payload.traces.length)).toEqual([1, 1]);
      expect(
        jobs
          .flatMap((job) =>
            job.data.payload.traces.map(({ traceId }) => traceId),
          )
          .sort(),
      ).toEqual(["first", "second"]);
      expect(await client().hlen(recordingKeys.pending)).toBe(0);
      expect(await client().zcard(recordingKeys.due)).toBe(0);
      expect(
        (await readRecordedBounds(member("project", "oversized"))).value
          .serializedEventBytes,
      ).toBe(101);
    },
  );

  it("re-dispatches late arrivals with the earliest start of the whole trace", async () => {
    env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS = 600;
    const start = Date.now() - 20 * 60_000;
    await trackLegacyTopicsBatchActivity("project", [
      event("late-trace", start),
    ]);
    const trackedAt = Date.now();
    await vi.waitFor(() =>
      expect(Date.now() - trackedAt).toBeGreaterThanOrEqual(400),
    );
    await makeDue("project", "late-trace");
    await runner().processBatch();
    const [first] = await queue.getJobs(["wait"]);
    expect(first.data.payload.traces[0].minStart).toBe(start);
    expect(await client().zcard(dueKey)).toBe(0);
    const dispatchedAt = Date.now();
    await vi.waitFor(() =>
      expect(Date.now() - dispatchedAt).toBeGreaterThanOrEqual(300),
    );

    const lateStart = start + 10 * 60_000;
    await trackLegacyTopicsBatchActivity("project", [
      event("late-trace", lateStart),
    ]);
    await makeDue("project", "late-trace");
    await runner().processBatch();
    const jobs = await queue.getJobs(["wait"]);
    expect(jobs).toHaveLength(2);
    const later = jobs.find((job) => job.id !== first.id)!;
    expect(later.data.payload.traces[0]).toMatchObject({
      minStart: start,
      maxStart: lateStart,
    });
    expect(later.data.payload.traces[0].revision).not.toBe(
      first.data.payload.traces[0].revision,
    );
    const backdatedStart = start + 3 * 60_000;
    await trackLegacyTopicsBatchActivity("project", [
      event("late-trace", backdatedStart),
    ]);
    await makeDue("project", "late-trace");
    await runner().processBatch();
    const backdated = (await queue.getJobs(["wait"])).find(
      (job) => job.id !== first.id && job.id !== later.id,
    )!;
    expect(backdated.data.payload.traces[0]).toMatchObject({
      minStart: start,
      maxStart: lateStart,
    });
  });

  it("keeps abandoned pending keys through idle time and the recovery grace", async () => {
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = 200;
    await trackLegacyTopicsBatchActivity("project", [event("long-idle")], 500);
    const due = Number(
      await client().zscore(dueKey, member("project", "long-idle")),
    );
    for (const key of [dueKey, stateKey])
      expect(Number(await client().pexpiretime(key))).toBeGreaterThanOrEqual(
        due + 200,
      );
    await vi.waitFor(() =>
      expect(Date.now()).toBeGreaterThanOrEqual(due + 100),
    );
    expect(await client().exists(dueKey, stateKey)).toBe(2);
    await vi.waitFor(async () =>
      expect(await client().exists(dueKey, stateKey)).toBe(0),
    );
  });

  it("expires first-seen history natively while keeping pending state independently", async () => {
    env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS = 150;
    const first = Date.now() - 600_000;
    await trackLegacyTopicsBatchActivity("project", [event("history", first)]);
    const firstKeys = getTraceBatchFirstKeys(0, Date.now()).keys;
    expect(
      (await Promise.all(firstKeys.map((key) => client().hlen(key)))).reduce(
        (sum, count) => sum + count,
        0,
      ),
    ).toBe(1);
    await makeDue("project", "history");
    await runner().processBatch();
    await vi.waitFor(async () => {
      expect(await client().exists(...firstKeys)).toBe(0);
    });
    const next = first + 300_000;
    await trackLegacyTopicsBatchActivity("project", [event("history", next)]);
    const state = JSON.parse(
      (await client().hget(stateKey, member("project", "history")))!,
    );
    expect(state).toMatchObject({
      minStart: next,
      eventUpdateCount: 1,
      serializedEventBytes: 100,
    });
    expect(await client().pttl(dueKey)).toBeGreaterThan(150);
  });

  it("distributes skewed projects by trace and dispatches every shard with single-slot scripts", async () => {
    const shardCount = 64;
    env.LANGFUSE_TRACE_BATCH_SHARD_COUNT = shardCount;
    const evaluate = client().eval.bind(client());
    const slots: string[][] = [];
    vi.spyOn(client(), "eval").mockImplementation(((
      script: string,
      count: number,
      ...args: (string | number | Buffer)[]
    ) => {
      slots.push(args.slice(0, count).map(String));
      return evaluate(script, count, ...args);
    }) as typeof evaluate);
    const evaluateCached = client().evalsha.bind(client());
    vi.spyOn(client(), "evalsha").mockImplementation(((
      scriptHash: string,
      count: number,
      ...args: (string | number | Buffer)[]
    ) => {
      slots.push(args.slice(0, count).map(String));
      return evaluateCached(scriptHash, count, ...args);
    }) as typeof evaluateCached);
    const count = 2_000;
    for (let project = 0; project < 11; project++) {
      topicsProjects.add(`project-${project}`);
      const size = project === 0 ? 600 : 140;
      await trackLegacyTopicsBatchActivity(
        `project-${project}`,
        Array.from({ length: size }, (_, i) => event(`trace-${project}-${i}`)),
      );
    }
    const counts = [];
    for (let shard = 0; shard < shardCount; shard++) {
      const { due } = getTraceBatchReadinessKeys(shard);
      const members = await client().zrange(due, 0, -1);
      counts.push(members.length);
      for (const entry of members)
        expect(getTraceBatchShard(entry)).toBe(shard);
      if (members.length)
        await client().zadd(
          due,
          ...members.flatMap((entry) => [Date.now() - 1_000, entry]),
        );
    }
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(count);
    expect(Math.max(...counts)).toBeLessThanOrEqual((1.5 * count) / shardCount);
    await runner().processBatch();
    const dispatched = (await queue.getJobs(["wait"])).flatMap(
      (job) => job.data.payload.traces,
    );
    expect(dispatched).toHaveLength(count);
    expect(
      new Set(
        dispatched.map(({ projectId, traceId }) => member(projectId, traceId)),
      ).size,
    ).toBe(count);
    for (const keys of slots) {
      expect(new Set(keys.map((key) => key.match(/\{[^}]+\}/)?.[0])).size).toBe(
        1,
      );
    }
  });

  it.each(["project", "locality"] as const)(
    "packs one project's traces across readiness shards with %s",
    async (strategy) => {
      env.LANGFUSE_TRACE_BATCH_SHARD_COUNT = 16;
      env.LANGFUSE_TRACE_BATCH_STRATEGY = strategy;
      const traceIds = Array.from(
        { length: 60 },
        (_, index) => `cross-shard-${index}`,
      );
      await trackLegacyTopicsBatchActivity(
        "project",
        traceIds.map((traceId) => event(traceId)),
      );
      for (const traceId of traceIds) {
        const entry = member("project", traceId);
        await client().zadd(
          getTraceBatchReadinessKeys(getTraceBatchShard(entry)).due,
          Date.now() - 1_000,
          entry,
        );
      }
      await runner().processBatch();
      const jobs = await queue.getJobs(["wait"]);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].data.payload.traces).toHaveLength(60);
      for (let shard = 0; shard < 16; shard++) {
        const { due, state } = getTraceBatchReadinessKeys(shard);
        expect(await client().zcard(due)).toBe(0);
        expect(await client().hlen(state)).toBe(0);
      }
    },
  );

  it("acknowledges enqueued batches by shard across a hydration window", async () => {
    env.LANGFUSE_TRACE_BATCH_SHARD_COUNT = 16;
    env.LANGFUSE_TRACE_BATCH_MAX_SIZE = 30;
    const traceIds = Array.from(
      { length: 120 },
      (_, index) => `trace-${index}`,
    );
    await trackLegacyTopicsBatchActivity(
      "project",
      traceIds.map((traceId) => event(traceId)),
    );
    for (const traceId of traceIds) {
      const entry = member("project", traceId);
      await client().zadd(
        getTraceBatchReadinessKeys(getTraceBatchShard(entry)).due,
        Date.now() - 1_000,
        entry,
      );
    }
    const evaluate = vi.spyOn(client(), "evalsha");
    await runner().processBatch();
    expect(await queue.getWaitingCount()).toBe(4);
    const acknowledgeSha = createHash("sha1")
      .update(ACKNOWLEDGE_SCRIPT)
      .digest("hex");
    const acknowledgements = evaluate.mock.calls.filter(
      ([sha]) => sha === acknowledgeSha,
    );
    expect(acknowledgements.length).toBeLessThanOrEqual(16);
    for (let shard = 0; shard < 16; shard++) {
      const { due, state } = getTraceBatchReadinessKeys(shard);
      expect(await client().zcard(due)).toBe(0);
      expect(await client().hlen(state)).toBe(0);
    }
  });

  it("samples recording map memory and paused/delayed queue work, then reports drained zeros", async () => {
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = "true";
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    await recordActivity("project", [
      { ...spanActivity("trace"), ruleIds: ["rule"] },
    ]);
    const data = {
      id: randomUUID(),
      name: QueueJobs.TraceBatch,
      timestamp: new Date(now),
      payload: { traces: [] },
    };
    const waiting = await queue.add(QueueJobs.TraceBatch, data, {
      timestamp: now - 5_000,
    });
    await queue.add(QueueJobs.TraceBatch, data, { timestamp: now - 1_000 });
    await queue.add(QueueJobs.TraceBatch, data, { delay: 120_000 });
    await queue.pause();
    // Age collection must not fetch or parse the batch payload.
    await connection.hset(queue.toKey(waiting.id!), "data", "invalid JSON");
    const metrics = new TraceBatchMetricsRunner();
    const evaluate = vi.spyOn(client(), "eval");
    await metrics["execute"]();

    for (const key of ["due", "pending"]) {
      expect(recordGauge).toHaveBeenCalledWith(
        "langfuse.trace_batch.redis_key_entries",
        1,
        { key, shard: "total", unit: "records" },
      );
      const sample = vi
        .mocked(recordGauge)
        .mock.calls.find(
          ([name, , tags]) =>
            name === "langfuse.trace_batch.redis_key_bytes" &&
            tags?.key === key,
        );
      expect(Number(sample?.[1])).toBeGreaterThan(0);
    }
    expect(recordGauge).toHaveBeenCalledWith(
      "langfuse.trace_batch.redis_key_bytes",
      expect.any(Number),
      { key: "bounds", shard: "sampled_mean", unit: "bytes" },
    );
    expect(recordGauge).toHaveBeenCalledWith(
      "langfuse.trace_batch.queue_depth",
      1,
      { type: "delayed", unit: "records" },
    );
    expect(recordGauge).not.toHaveBeenCalledWith(
      "langfuse.trace_batch.queue_depth",
      expect.anything(),
      expect.objectContaining({ type: "waiting" }),
    );
    expect(recordGauge).toHaveBeenCalledWith(
      "langfuse.trace_batch.queue_waiting_head_age_ms",
      5_000,
      { unit: "milliseconds" },
    );

    clock.mockReturnValue(now + 30_000);
    await metrics["execute"]();
    // One map sample plus one bounds sample; the interval suppresses the second run.
    expect(evaluate).toHaveBeenCalledTimes(2);
    await clearReadiness();
    await queue.drain(true);
    vi.mocked(recordGauge).mockClear();
    clock.mockReturnValue(now + 60_000);
    await metrics["execute"]();
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(recordGauge).toHaveBeenCalledWith(
      "langfuse.trace_batch.active_reads",
      0,
    );
    expect(vi.mocked(recordGauge).mock.calls).toHaveLength(7);
    expect(
      vi.mocked(recordGauge).mock.calls.every(([, value]) => value === 0),
    ).toBe(true);
  });

  it("awaits failed telemetry collections while preserving independent queue measurements", async () => {
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = "true";
    const metrics = new TraceBatchMetricsRunner();
    const pendingMemory = Promise.withResolvers<number[]>();
    vi.spyOn(client(), "eval").mockImplementationOnce(
      () => pendingMemory.promise,
    );
    vi.spyOn(queue, "getJobCounts").mockRejectedValueOnce(
      new Error("queue unavailable"),
    );
    let completed = false;
    const collection = metrics["execute"]().then(() => {
      completed = true;
    });
    await vi.waitFor(() =>
      expect(recordGauge).toHaveBeenCalledWith(
        "langfuse.trace_batch.queue_waiting_head_age_ms",
        0,
        { unit: "milliseconds" },
      ),
    );
    expect(completed).toBe(false);
    pendingMemory.reject(new Error("memory unavailable"));
    await collection;
    // Only active reads and queue age succeed; failed memory samples emit no zeros.
    expect(vi.mocked(recordGauge).mock.calls).toHaveLength(2);
  });

  it("dispatches with locality selection and records bounded selector measurements", async () => {
    env.LANGFUSE_TRACE_BATCH_STRATEGY = "locality";
    const minute = 60_000;
    await trackLegacyTopicsBatchActivity("project-a", [
      event("short-1", 10 * minute),
      event("short-1", 12 * minute),
      event("wide", 0),
      event("wide", 8 * 60 * minute),
    ]);
    await trackLegacyTopicsBatchActivity("project-b", [
      event("short-2", 11 * minute),
      event("short-2", 13 * minute),
    ]);
    const due = Date.now() - 1_000;
    await client().zadd(
      dueKey,
      due,
      member("project-a", "short-1"),
      due + 1,
      member("project-a", "wide"),
      due + 2,
      member("project-b", "short-2"),
    );

    await runner().processBatch();

    const jobs = await queue.getJobs(["wait"]);
    expect(
      jobs
        .map((job) =>
          job.data.payload.traces
            .map(({ traceId }) => traceId)
            .sort()
            .join(","),
        )
        .sort(),
    ).toEqual(["short-1,short-2,wide"]);
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.trace_batch.candidate_buffer_size",
      3,
      { strategy: "locality" },
    );
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.trace_batch.event_time_envelope_ms",
      29_040_000,
      { strategy: "locality" },
    );
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.dispatched_batches",
      1,
      { strategy: "locality", fill: "partial" },
    );
    expect(
      vi
        .mocked(recordDistribution)
        .mock.calls.some(
          ([name, value, tags]) =>
            name === "langfuse.trace_batch.selector_duration_ms" &&
            Number(value) >= 0 &&
            tags?.strategy === "locality",
        ),
    ).toBe(true);
  });

  it("excludes oversized traces from dispatch, removes their state, and reports their IDs", async () => {
    env.LANGFUSE_TRACE_BATCH_MAX_TRACE_EVENT_UPDATES = 3;
    env.LANGFUSE_TRACE_BATCH_MAX_TRACE_SERIALIZED_BYTES = 1_000;
    const warn = vi.spyOn(shared.logger, "warn");
    await trackLegacyTopicsBatchActivity("project", [
      ...Array.from({ length: 4 }, (_, index) =>
        event("many-updates", 1_000_000 + index),
      ),
      event("large-input", 1_000_000, 5_000),
      event("small", 1_000_000),
    ]);
    await makeDue("project", "many-updates", "large-input", "small");

    await runner().processBatch();

    const jobs = await queue.getJobs(["wait"]);
    expect(
      jobs.map((job) => job.data.payload.traces.map(({ traceId }) => traceId)),
    ).toEqual([["small"]]);
    expect(await client().zcard(dueKey)).toBe(0);
    expect(await client().hlen(stateKey)).toBe(0);
    for (const [traceId, reason] of [
      ["many-updates", "event_updates"],
      ["large-input", "serialized_bytes"],
    ] as const) {
      expect(recordIncrement).toHaveBeenCalledWith(
        "langfuse.trace_batch.excluded_traces",
        1,
        { reason, strategy: "project" },
      );
      expect(warn).toHaveBeenCalledWith(
        "Trace batch excluded oversized trace",
        expect.objectContaining({ projectId: "project", traceId, reason }),
      );
    }
    await trackLegacyTopicsBatchActivity("project", [
      event("many-updates", 1_000_004),
      event("large-input", 1_000_001),
    ]);
    for (const [traceId, eventUpdateCount, serializedEventBytes] of [
      ["many-updates", 5, 500],
      ["large-input", 2, 5_100],
    ] as const)
      expect(
        JSON.parse(
          (await client().hget(stateKey, member("project", traceId)))!,
        ),
      ).toMatchObject({ eventUpdateCount, serializedEventBytes });
    await makeDue("project", "many-updates", "large-input");
    await runner().processBatch();
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().zcard(dueKey)).toBe(0);
    expect(await client().hlen(stateKey)).toBe(0);
  });

  it("uses retained full-trace estimates for batch budgets after successful dispatch", async () => {
    const original = env.LANGFUSE_TRACE_BATCH_MAX_BATCH_EVENT_UPDATES;
    env.LANGFUSE_TRACE_BATCH_MAX_BATCH_EVENT_UPDATES = 6;
    try {
      const ingest = async (start: number) => {
        await trackLegacyTopicsBatchActivity("project", [
          event("a", start),
          event("a", start),
          event("b", start),
          event("b", start),
        ]);
        await makeDue("project", "a", "b");
        await runner().processBatch();
      };
      await ingest(1_000_000);
      const [first] = await queue.getJobs(["wait"]);
      expect(first.data.payload.traces).toHaveLength(2);
      await ingest(1_000_001);
      const lateJobs = (await queue.getJobs(["wait"])).filter(
        (job) => job.id !== first.id,
      );
      expect(lateJobs).toHaveLength(2);
      expect(lateJobs.flatMap((job) => job.data.payload.traces)).toHaveLength(
        2,
      );
      for (const job of lateJobs) {
        expect(job.data.payload.traces).toHaveLength(1);
        expect(job.data.payload.traces[0].minStart).toBe(1_000_000);
      }
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.estimated_event_update_count",
        4,
        { scope: "trace", strategy: "project" },
      );
    } finally {
      env.LANGFUSE_TRACE_BATCH_MAX_BATCH_EVENT_UPDATES = original;
    }
  });

  it("does not report an oversized trace as excluded when new activity keeps it pending", async () => {
    env.LANGFUSE_TRACE_BATCH_MAX_TRACE_EVENT_UPDATES = 3;
    const warn = vi.spyOn(shared.logger, "warn");
    await trackLegacyTopicsBatchActivity(
      "project",
      Array.from({ length: 4 }, (_, index) =>
        event("reactivated", 1_000_000 + index),
      ),
    );
    await makeDue("project", "reactivated");
    const evaluate = client().evalsha.bind(client());
    let reactivated = false;
    vi.spyOn(client(), "evalsha").mockImplementation((async (
      scriptHash: string,
      keyCount: number,
      ...args: (string | number)[]
    ) => {
      if (
        !reactivated &&
        keyCount > 2 &&
        Number(args[keyCount]) === env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS
      ) {
        reactivated = true;
        const traceMember = member("project", "reactivated");
        const state = JSON.parse((await client().hget(stateKey, traceMember))!);
        await client().hset(
          stateKey,
          traceMember,
          JSON.stringify({ ...state, revision: randomUUID() }),
        );
      }
      return evaluate(scriptHash, keyCount, ...args);
    }) as typeof evaluate);

    await runner().processBatch();

    expect(reactivated).toBe(true);
    expect(
      await client().hexists(stateKey, member("project", "reactivated")),
    ).toBe(1);
    expect(recordIncrement).not.toHaveBeenCalledWith(
      "langfuse.trace_batch.excluded_traces",
      expect.anything(),
      expect.anything(),
    );
    expect(warn).not.toHaveBeenCalledWith(
      "Trace batch excluded oversized trace",
      expect.anything(),
    );
    expect(recordIncrement).not.toHaveBeenCalledWith(
      "langfuse.trace_batch.reactivated_traces",
      1,
    );
  });

  it("sets the due time from the project's trace idle time, capped below the pending TTL", async () => {
    const orgId = `org-${randomUUID()}`;
    const projectId = `project-${randomUUID()}`;
    topicsProjects.add(projectId);
    await prisma.organization.create({
      data: { id: orgId, name: "Idle time org" },
    });
    await prisma.project.create({
      data: { id: projectId, orgId, name: "Idle time project" },
    });
    try {
      await shared.saveTracingReadinessSettings(projectId, {
        traceIdleMs: 3_600_000,
      });
      const now = Date.now();
      // The Lua script reads Redis time, so allow for clock skew.
      const dueOffset = async (traceId: string) =>
        Number(await client().zscore(dueKey, member(projectId, traceId))) - now;

      await trackLegacyTopicsBatchActivity(projectId, [event("custom")]);
      await trackLegacyTopicsBatchActivity("project", [event("default")]);
      expect(await dueOffset("custom")).toBeGreaterThan(3_590_000);
      expect(await dueOffset("custom")).toBeLessThan(3_610_000);
      expect(
        Number(await client().zscore(dueKey, member("project", "default"))) -
          now,
      ).toBeLessThan(610_000);

      env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = 1_800_000;
      await trackLegacyTopicsBatchActivity(projectId, [event("capped")]);
      expect(await dueOffset("capped")).toBeLessThan(1_780_000);
      expect(await dueOffset("capped")).toBeGreaterThan(1_760_000);
    } finally {
      await prisma.organization.delete({ where: { id: orgId } });
    }
  });

  it("caches the project's settings in Redis with an expiry and replaces them on save", async () => {
    const orgId = `org-${randomUUID()}`;
    const projectId = `project-${randomUUID()}`;
    topicsProjects.add(projectId);
    const cacheKey = `langfuse:tracing-readiness-settings:${projectId}`;
    await prisma.organization.create({
      data: { id: orgId, name: "Idle time cache org" },
    });
    await prisma.project.create({
      data: { id: projectId, orgId, name: "Idle time cache project" },
    });
    try {
      await trackLegacyTopicsBatchActivity(projectId, [event("uncached")]);
      expect(JSON.parse((await connection.get(cacheKey))!)).toEqual({
        traceIdleMs: null,
      });
      const ttl = await connection.ttl(cacheKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
      await shared.saveTracingReadinessSettings(projectId, {
        traceIdleMs: 300_000,
      });
      expect(JSON.parse((await connection.get(cacheKey))!)).toEqual({
        traceIdleMs: 300_000,
      });
      await trackLegacyTopicsBatchActivity(projectId, [event("saved")]);
      const offset =
        Number(await client().zscore(dueKey, member(projectId, "saved"))) -
        Date.now();
      expect(offset).toBeGreaterThan(290_000);
      expect(offset).toBeLessThan(310_000);
    } finally {
      await prisma.organization.delete({ where: { id: orgId } });
      await connection.del(cacheKey);
    }
  });

  it("does not let an earlier database read overwrite newly saved settings", async () => {
    const orgId = `org-${randomUUID()}`;
    const projectId = `project-${randomUUID()}`;
    const cacheKey = `langfuse:tracing-readiness-settings:${projectId}`;
    await prisma.organization.create({
      data: { id: orgId, name: "Idle time race org" },
    });
    await prisma.project.create({
      data: { id: projectId, orgId, name: "Idle time race project" },
    });
    try {
      await shared.saveTracingReadinessSettings(projectId, {
        traceIdleMs: 120_000,
      });
      await connection.del(cacheKey);

      let releaseFill!: () => void;
      const fillHeld = new Promise<void>((resolve) => {
        releaseFill = resolve;
      });
      let signalFill!: () => void;
      const fillStarted = new Promise<void>((resolve) => {
        signalFill = resolve;
      });
      const actualShared = await vi.importActual<
        typeof import("@langfuse/shared/src/server")
      >("@langfuse/shared/src/server");
      if (!actualShared.redis)
        throw new Error("Redis is required for this test");
      const originalSet = actualShared.redis.set.bind(actualShared.redis);
      vi.spyOn(actualShared.redis, "set").mockImplementationOnce(
        async (...args) => {
          signalFill();
          await fillHeld;
          return originalSet(...args);
        },
      );

      const earlierRead = shared.getTracingReadinessSettings(projectId);
      await fillStarted;
      try {
        await shared.saveTracingReadinessSettings(projectId, {
          traceIdleMs: 300_000,
        });
      } finally {
        releaseFill();
      }
      await earlierRead;

      expect(await shared.getTracingReadinessSettings(projectId)).toEqual({
        traceIdleMs: 300_000,
      });
    } finally {
      await prisma.organization.delete({ where: { id: orgId } });
      await connection.del(cacheKey);
    }
  });

  it("uses and caches the default for an out-of-range stored idle time", async () => {
    const orgId = `org-${randomUUID()}`;
    const projectId = `project-${randomUUID()}`;
    const cacheKey = `langfuse:tracing-readiness-settings:${projectId}`;
    await prisma.organization.create({
      data: { id: orgId, name: "Invalid idle time org" },
    });
    await prisma.project.create({
      data: { id: projectId, orgId, name: "Invalid idle time project" },
    });
    try {
      await prisma.tracingReadinessSettings.create({
        data: { projectId, traceIdleMs: 1 },
      });

      expect(await shared.getTracingReadinessSettings(projectId)).toEqual({
        traceIdleMs: null,
      });
      expect(JSON.parse((await connection.get(cacheKey))!)).toEqual({
        traceIdleMs: null,
      });
    } finally {
      await prisma.organization.delete({ where: { id: orgId } });
      await connection.del(cacheKey);
    }
  });

  it("uses the default when the idle time read fails", async () => {
    const projectId = `project-${randomUUID()}`;
    topicsProjects.add(projectId);
    vi.mocked(shared.getTracingReadinessSettings).mockRejectedValueOnce(
      new Error("Postgres unavailable"),
    );

    await trackLegacyTopicsBatchActivity(projectId, [event("failed")]);

    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.idle_time_read_failures",
      1,
    );
    const offset =
      Number(await client().zscore(dueKey, member(projectId, "failed"))) -
      Date.now();
    expect(offset).toBeGreaterThan(590_000);
    expect(offset).toBeLessThan(610_000);
  });

  it("does not track or dispatch on self-hosted deployments even with experiment flags enabled", async () => {
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    const evaluate = vi.spyOn(client(), "eval");
    const lock = vi.spyOn(client(), "set");
    await trackLegacyTopicsBatchActivity("project", [event("trace")]);
    await runner()["execute"]();
    const metrics = new TraceBatchMetricsRunner();
    await metrics["execute"]();
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED = "false";
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
    vi.mocked(isTopicsEnabled).mockReturnValue(false);
    await metrics["execute"]();
    expect(evaluate).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
    expect(await client().exists(dueKey, stateKey)).toBe(0);
    expect(await queue.count()).toBe(0);
  });

  it("ingests through BullMQ, postpones readiness on new activity, and consumes full ClickHouse payloads once due", async () => {
    const orgId = randomUUID();
    const projectId = randomUUID();
    topicsProjects.add(projectId);
    const excludedProjectId = randomUUID();
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Trace batch late arrivals",
        projects: {
          create: [
            { id: projectId, name: "Trace batch" },
            { id: excludedProjectId, name: "Topics disabled" },
          ],
        },
      },
    });
    const usage = {
      providedUsageDetails: {},
      usageDetails: {},
      providedCostDetails: {},
      costDetails: {},
    };
    vi.mocked(summarizeTopicTraceFacets).mockImplementation(
      async (_models, facets) => ({
        output: Object.fromEntries(
          facets.map(({ key }) => [
            key,
            {
              notes: "The complete trace was read.",
              summary: `summary-${vi.mocked(summarizeTopicTraceFacets).mock.calls.length}`,
              status: "applicable" as const,
            },
          ]),
        ),
        ...usage,
      }),
    );
    vi.mocked(embedTopicSummaries).mockImplementation(
      async (_model, summaries, dimensions) => ({
        embeddings: summaries.map(() =>
          Array.from({ length: dimensions }, () => 0.1),
        ),
        ...usage,
      }),
    );
    const original = {
      LANGFUSE_TRACE_BATCH_IDLE_MS: env.LANGFUSE_TRACE_BATCH_IDLE_MS,
      LANGFUSE_MIGRATION_V4_WRITE_MODE: env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
      LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED:
        env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED,
      LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED:
        env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED,
    };
    env.LANGFUSE_TRACE_BATCH_IDLE_MS = 4_000;
    env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = 0.1;
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
    env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED = "false";
    env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED = "false";

    const ingestionName = `trace-batch-ingestion-test-${randomUUID()}`;
    const ingestionQueue = new Queue<
      TQueueJobTypes[QueueName.OtelIngestionQueue]
    >(ingestionName, { connection, prefix: getQueuePrefix(ingestionName) });
    const ingestionEvents = new QueueEvents(ingestionName, {
      connection,
      prefix: ingestionQueue.opts.prefix,
    });
    const ingestionWorker = new Worker(
      ingestionName,
      otelIngestionQueueProcessorBuilder(false),
      { connection, prefix: ingestionQueue.opts.prefix },
    );
    const batchEvents = new QueueEvents(queue.name, {
      connection,
      prefix: queue.opts.prefix,
    });
    const batchWorker = new Worker(queue.name, traceBatchQueueProcessor, {
      connection,
      prefix: queue.opts.prefix,
    });
    const topicsName = `topics-trace-test-${randomUUID()}`;
    const topicsQueue = new Queue<TQueueJobTypes[QueueName.TopicsTrace]>(
      topicsName,
      { connection, prefix: getQueuePrefix(topicsName) },
    );
    vi.spyOn(TopicsTraceQueue, "getInstance").mockReturnValue(topicsQueue);
    const topicsWorker = new Worker(
      topicsName,
      topicsTraceQueueProcessorBuilder(topicsName),
      { connection, prefix: topicsQueue.opts.prefix },
    );
    const writer = ClickhouseWriter.getInstance();
    // Waits for the per-trace Topics jobs trace-batch enqueued, then writes their rows.
    async function drainTopics(completed: number) {
      await expect
        .poll(
          async () =>
            await topicsQueue.getJobCounts(
              "wait",
              "active",
              "delayed",
              "completed",
              "failed",
            ),
          { interval: 50, timeout: 10_000 },
        )
        .toEqual({ wait: 0, active: 0, delayed: 0, completed, failed: 0 });
      await writer.flushAll(true);
    }

    try {
      await Promise.all([
        ingestionWorker.waitUntilReady(),
        ingestionEvents.waitUntilReady(),
        batchWorker.waitUntilReady(),
        batchEvents.waitUntilReady(),
        topicsWorker.waitUntilReady(),
      ]);
      const traceId = "00000000000000000000000000000001";
      const otherTraceId = "00000000000000000000000000000003";
      const excludedTraceId = "00000000000000000000000000000002";
      const input = JSON.stringify([
        { role: "user", content: "input".repeat(1_000) },
      ]);
      const output = JSON.stringify({
        role: "assistant",
        content: "output".repeat(1_000),
      });
      const metadata = JSON.stringify({ context: "metadata".repeat(1_000) });
      const nano = BigInt(Date.now() - 20 * 60_000) * 1_000_000n;
      async function ingest(
        traceIds: string[],
        start = nano,
        ingestionProjectId = projectId,
      ) {
        const timestamp = {
          low: Number(start & 0xffffffffn),
          high: Number(start >> 32n),
          unsigned: true,
        };
        // S3 transport and unrelated evaluator configuration are stubbed;
        // OTLP conversion, writer, Redis scripts and both queue workers are real.
        vi.mocked(getS3EventStorageClient).mockReturnValue({
          download: vi.fn().mockResolvedValue(
            JSON.stringify([
              {
                resource: { attributes: [] },
                scopeSpans: [
                  {
                    scope: { name: "langfuse-sdk", version: "4.0.0" },
                    spans: traceIds.map((id) => ({
                      traceId: Buffer.from(id, "hex").toJSON(),
                      spanId: randomBytes(8).toJSON(),
                      name: "trace-batch-integration",
                      kind: 1,
                      startTimeUnixNano: timestamp,
                      endTimeUnixNano: timestamp,
                      status: { code: 2, message: "tool call failed" },
                      attributes: Object.entries({
                        "langfuse.observation.type": "generation",
                        "langfuse.observation.input": input,
                        "langfuse.observation.output": output,
                        "langfuse.observation.metadata": metadata,
                      }).map(([key, value]) => ({
                        key,
                        value: { stringValue: value },
                      })),
                    })),
                  },
                ],
              },
            ]),
          ),
        } as unknown as ReturnType<typeof getS3EventStorageClient>);
        const job = await ingestionQueue.add(QueueJobs.OtelIngestionJob, {
          id: randomUUID(),
          timestamp: new Date(),
          name: QueueJobs.OtelIngestionJob,
          payload: {
            data: { fileKey: "trace-batch-integration.json" },
            authCheck: {
              validKey: true,
              scope: {
                projectId: ingestionProjectId,
                orgId,
                accessLevel: "project",
              },
            },
            ingestionVersion: "4",
          },
        });
        await job.waitUntilFinished(ingestionEvents, 10_000);
      }
      async function waitUntilRedisTime(deadline: number) {
        await expect
          .poll(
            async () => {
              const [seconds, microseconds] = await client().time();
              return (
                Number(seconds) * 1_000 +
                Math.floor(Number(microseconds) / 1_000)
              );
            },
            { interval: 25, timeout: 10_000 },
          )
          .toBeGreaterThanOrEqual(deadline);
      }

      await ingest([traceId]);
      await ingest([excludedTraceId], nano, excludedProjectId);
      expect(await client().hlen(stateKey)).toBe(1);
      const firstDue = Number(
        await client().zscore(dueKey, member(projectId, traceId)),
      );
      await waitUntilRedisTime(firstDue - 2_000);
      // Leave ample time to check the old deadline even on a busy CI worker.
      env.LANGFUSE_TRACE_BATCH_IDLE_MS = 10_000;
      await ingest([traceId, otherTraceId]);
      await ingest([excludedTraceId], nano, excludedProjectId);
      const renewedDue = Number(
        await client().zscore(dueKey, member(projectId, traceId)),
      );
      expect(renewedDue).toBeGreaterThan(firstDue);
      expect(await client().hlen(stateKey)).toBe(2);

      const dispatcher = runner();
      await waitUntilRedisTime(firstDue);
      await dispatcher.processBatch();
      expect(await queue.getJobCounts("wait", "active", "completed")).toEqual({
        wait: 0,
        active: 0,
        completed: 0,
      });

      await writer.flushAll(true);
      // Inactive Topics projects still ingest observations without readiness state.
      let excludedObservations = 0;
      for await (const observation of getTraceBatchEventStream({
        traces: [
          {
            projectId: excludedProjectId,
            traceId: excludedTraceId,
            minStart: Number(nano / 1_000_000n),
            maxStart: Number(nano / 1_000_000n),
          },
        ],
      })) {
        expect(observation).toMatchObject({
          trace_id: excludedTraceId,
          level: "ERROR",
          status_message: "tool call failed",
        });
        excludedObservations++;
      }
      expect(excludedObservations).toBe(2);
      const facets = await ensureDefaultTopicFacets(projectId);
      await saveTopicRule({
        projectId,
        filter: [],
        facetIds: facets.map((facet) => facet.id),
      });
      env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
      env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED = "false";
      env.LANGFUSE_TRACE_BATCH_READ_ENABLED = "false";
      env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = 0;
      await waitUntilRedisTime(renewedDue);
      await dispatcher.processBatch();
      const [batch] = await queue.getJobs(["wait", "active", "completed"]);
      expect(
        batch.data.payload.traces.map((trace) => trace.traceId).sort(),
      ).toEqual([traceId, otherTraceId].sort());
      const result = await batch.waitUntilFinished(batchEvents, 10_000);
      expect(result).toMatchObject({
        observationCount: 3,
        traceCount: 2,
        projectCount: 1,
      });
      // All three observations must carry their untruncated I/O and metadata.
      expect(result.ioMetadataBytes).toBeGreaterThanOrEqual(
        3 * (Buffer.byteLength(input) + Buffer.byteLength(output) + 8_000),
      );
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.size",
        2,
      );
      expect(recordDistribution).not.toHaveBeenCalledWith(
        "langfuse.trace_batch.io_metadata_bytes",
        expect.anything(),
      );
      expect(await client().zcard(dueKey)).toBe(0);
      expect(await client().hlen(stateKey)).toBe(0);
      await dispatcher.processBatch();
      expect(await queue.getCompletedCount()).toBe(1);
      // One per-trace job each; trace-batch itself calls no model.
      await drainTopics(2);
      expect(summarizeTopicTraceFacets).toHaveBeenCalledTimes(2);
      const summaries = async () =>
        (
          await Promise.all(
            facets.map((facet) =>
              listTopicSummaries(
                projectId,
                {
                  traceIds: [traceId, otherTraceId],
                  facetId: facet.id,
                  facetVersion: facet.versions[0].version,
                },
                {
                  from: new Date(Number(nano / 1_000_000n) - 1),
                  to: new Date(),
                },
              ),
            ),
          )
        ).flat();
      const firstSummaries = await summaries();
      expect(firstSummaries).toHaveLength(8);

      // One late event stays within the original buffer, while the other is
      // ten minutes away and requires the retained earliest start.
      env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "true";
      env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = 1;
      await ingest([traceId], nano + 60_000n * 1_000_000n);
      await ingest([otherTraceId], nano + 10n * 60_000n * 1_000_000n);
      await writer.flushAll(true);
      await makeDue(projectId, traceId, otherTraceId);
      await dispatcher.processBatch();
      const lateBatch = (
        await queue.getJobs(["wait", "active", "completed"])
      ).find((job) => job.id !== batch.id)!;
      for (const trace of lateBatch.data.payload.traces)
        expect(trace.minStart).toBe(Number(nano / 1_000_000n));
      const lateResult = await lateBatch.waitUntilFinished(batchEvents, 10_000);
      expect(lateResult).toMatchObject({ observationCount: 5, traceCount: 2 });
      // New revisions are new jobs, so both traces are summarized again.
      await drainTopics(4);
      expect(summarizeTopicTraceFacets).toHaveBeenCalledTimes(4);

      await ingest([otherTraceId], nano + 3n * 60_000n * 1_000_000n);
      await writer.flushAll(true);
      await makeDue(projectId, otherTraceId);
      await dispatcher.processBatch();
      const backdatedBatch = (
        await queue.getJobs(["wait", "active", "completed"])
      ).find((job) => job.id !== batch.id && job.id !== lateBatch.id)!;
      expect(backdatedBatch.data.payload.traces).toMatchObject([
        {
          minStart: Number(nano / 1_000_000n),
          maxStart: Number(nano / 1_000_000n) + 10 * 60_000,
        },
      ]);
      expect(
        await backdatedBatch.waitUntilFinished(batchEvents, 10_000),
      ).toMatchObject({ observationCount: 3, traceCount: 1 });
      await drainTopics(5);
      expect(summarizeTopicTraceFacets).toHaveBeenCalledTimes(5);
      const latest = await summaries();
      expect(latest).toHaveLength(8);
      for (const summary of latest) {
        expect(summary.unitStartTime).toBe(
          firstSummaries.find((row) => row.traceId === summary.traceId)!
            .unitStartTime,
        );
        expect(summary.summary).not.toBe(
          firstSummaries.find(
            (row) =>
              row.traceId === summary.traceId &&
              row.facetId === summary.facetId,
          )!.summary,
        );
      }
    } finally {
      try {
        await Promise.all([
          ingestionWorker.close(),
          batchWorker.close(),
          topicsWorker.close(),
        ]);
        await Promise.all([ingestionEvents.close(), batchEvents.close()]);
        await ingestionQueue.obliterate({ force: true });
        await ingestionQueue.close();
        await topicsQueue.obliterate({ force: true });
        await topicsQueue.close();
        await writer.shutdown();
      } finally {
        topicsProjects.delete(projectId);
        await prisma.organization.deleteMany({ where: { id: orgId } });
        Object.assign(env, original);
      }
    }
  }, 30_000);

  it("tracks only active Topics projects independently of obsolete intake and sampling flags", async () => {
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
    const samplingRate = env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE;
    env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = 0;
    topicsProjects.add("topics-project");
    topicsProjects.add("inactive-project");
    try {
      vi.mocked(recordIncrement).mockClear();
      await trackLegacyTopicsBatchActivity("other-project", [
        event("other-trace"),
      ]);
      vi.mocked(getTopicsProcessingSampling).mockResolvedValueOnce(0);
      await trackLegacyTopicsBatchActivity("inactive-project", [
        event("inactive-trace"),
      ]);
      expect(recordIncrement).not.toHaveBeenCalled();
      await trackLegacyTopicsBatchActivity("topics-project", [
        event("topics-trace"),
      ]);
      // An unreadable gate falls back to the allowlist.
      vi.mocked(getTopicsProcessingSampling).mockRejectedValueOnce(
        new Error("postgres down"),
      );
      await trackLegacyTopicsBatchActivity("topics-project", [
        event("fallback-trace"),
      ]);
      expect(recordIncrement).toHaveBeenCalledWith(
        "langfuse.trace_batch.topics_gate_failures",
        1,
      );
      expect((await client().hkeys(stateKey)).sort()).toEqual(
        [
          member("topics-project", "topics-trace"),
          member("topics-project", "fallback-trace"),
        ].sort(),
      );
    } finally {
      topicsProjects.clear();
      env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = samplingRate;
    }
  });

  it("does not load idle settings for inactive Topics projects even at the old sampling rate 1", async () => {
    env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = 1;
    topicsProjects.delete("project");
    vi.mocked(shared.getTracingReadinessSettings).mockClear();

    await trackLegacyTopicsBatchActivity("project", [event("sampled-out")]);

    expect(shared.getTracingReadinessSettings).not.toHaveBeenCalled();
    expect(await client().hlen(stateKey)).toBe(0);
  });

  it("admits the larger of the Topics rule's rate and the experiment rate", async () => {
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = "true";
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
    env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE = 1;
    const traceIds = Array.from({ length: 1_000 }, (_, index) =>
      index.toString(16).padStart(32, "0"),
    );
    let previous: string[] = [];
    for (const [rate, expectedCount] of [
      [0, 0],
      [0.1, 78],
      [0.5, 478],
      [1, 1_000],
    ]) {
      env.LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE = rate;
      // "project" is an active Topics project whose rule samples everything.
      expect(await resolveTraceBatchSamplingRate("project")).toBe(1);
      const samplingRate = await resolveTraceBatchSamplingRate("other-project");
      expect(samplingRate).toBe(rate);
      const selected = traceIds.filter((traceId) =>
        isTraceBatchSampled(traceId, samplingRate),
      );
      expect(selected).toHaveLength(expectedCount);
      expect(selected).toEqual(expect.arrayContaining(previous));
      previous = selected;
    }
    // A rule sampling below the experiment rate admits the experiment share.
    env.LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE = 0.5;
    vi.mocked(getTopicsProcessingSampling).mockResolvedValueOnce(0.25);
    expect(await resolveTraceBatchSamplingRate("project")).toBe(0.5);
    // A rule sampling above it admits the rule's share.
    env.LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE = 0.1;
    vi.mocked(getTopicsProcessingSampling).mockResolvedValueOnce(0.25);
    expect(await resolveTraceBatchSamplingRate("project")).toBe(0.25);
    // Legacy mode admits Topics projects at the rule's rate only.
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = "false";
    vi.mocked(getTopicsProcessingSampling).mockResolvedValueOnce(0.25);
    expect(await resolveTraceBatchSamplingRate("project")).toBe(0.25);
    expect(await resolveTraceBatchSamplingRate("other-project")).toBe(0);
  });

  it("counts only acknowledged update volume when tracking fails after a chunk", async () => {
    await trackLegacyTopicsBatchActivity("warm-up", [event("trace")]);
    await clearReadiness();
    vi.mocked(recordIncrement).mockClear();
    const fallback = vi.spyOn(client(), "eval");
    const pipeline = client().pipeline.bind(client());
    let commands = 0;
    vi.spyOn(client(), "pipeline").mockImplementation(() => {
      const batch = pipeline();
      const evaluate = batch.evalsha.bind(batch);
      vi.spyOn(batch, "evalsha").mockImplementation(((
        scriptHash: string,
        keyCount: number,
        ...args: (string | number | Buffer)[]
      ) => {
        // Fail one command before mutation; the other pipelined chunks still execute.
        if (++commands === 2) args[1] = args[0];
        // Simulate a cache miss for one sibling without flushing shared Redis scripts.
        if (commands === 3) scriptHash = "0".repeat(40);
        return evaluate(scriptHash, keyCount, ...args);
      }) as typeof evaluate);
      return batch;
    });

    await expect(
      trackLegacyTopicsBatchActivity("project", [
        ...Array.from({ length: 1_001 }, (_, index) =>
          event(`trace-${index}`, 100, 7),
        ),
        { ...event("invalid"), startTimeISO: "not-a-date" },
      ]),
    ).resolves.toBeUndefined();

    const recorded = await client().hlen(stateKey);
    expect(recorded).toBe(150);
    expect(commands).toBe(4);
    expect(fallback).toHaveBeenCalledOnce();
    for (const state of await client().hvals(stateKey))
      expect(JSON.parse(state)).toMatchObject({
        eventUpdateCount: 1,
        serializedEventBytes: 7,
      });
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.event_updates",
      1_001,
      { stage: "eligible" },
    );
    expect(recordIncrement).not.toHaveBeenCalledWith(
      "langfuse.trace_batch.event_updates",
      expect.anything(),
      { stage: "sampled" },
    );
    for (const [metric, count] of [
      ["event_updates", recorded],
      ["serialized_event_bytes", recorded * 7],
    ] as const)
      expect(
        vi
          .mocked(recordIncrement)
          .mock.calls.filter(
            ([name, , tags]) =>
              name === `langfuse.trace_batch.${metric}` &&
              tags?.stage === "recorded",
          )
          .reduce((sum, [, value]) => sum + value, 0),
      ).toBe(count);
    expect(recordIncrement).not.toHaveBeenCalledWith(
      "langfuse.trace_batch.event_updates",
      1,
      { stage: "recorded" },
    );
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.tracking_errors",
      1,
    );
  });

  it("preserves min/max across concurrent out-of-order arrivals, resets readiness, and separates tenants", async () => {
    await Promise.all(
      [30, 0, 20, 10].map((start) =>
        trackLegacyTopicsBatchActivity("project", [
          event("trace", start, 100 + start),
          event("trace", start, 200 + start),
        ]),
      ),
    );
    const state = JSON.parse(
      (await client().hget(stateKey, member("project", "trace")))!,
    );
    expect(state).toMatchObject({
      minStart: 0,
      maxStart: 30,
      eventUpdateCount: 8,
      serializedEventBytes: 1_320,
    });
    await makeDue("project", "trace");
    await trackLegacyTopicsBatchActivity("project", [
      event("trace", 15, 25),
      event("trace", 15, 25),
    ]);
    expect(
      JSON.parse((await client().hget(stateKey, member("project", "trace")))!),
    ).toMatchObject({ eventUpdateCount: 10, serializedEventBytes: 1_370 });
    expect(
      Number(await client().zscore(dueKey, member("project", "trace"))),
    ).toBeGreaterThan(Date.now() + 590_000);
    await trackLegacyTopicsBatchActivity("other", [event("trace", 100, 7)]);
    expect(
      JSON.parse((await client().hget(stateKey, member("other", "trace")))!),
    ).toMatchObject({
      minStart: 100,
      maxStart: 100,
      eventUpdateCount: 1,
      serializedEventBytes: 7,
    });
    await runner().processBatch();
    expect(await queue.getWaitingCount()).toBe(0);
    await makeDue("project", "trace");
    await makeDue("other", "trace");
    await runner().processBatch();
    for (const [count, bytes] of [
      [10, 1_370],
      [1, 7],
    ]) {
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.estimated_event_update_count",
        count,
        { scope: "trace", strategy: "project" },
      );
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.estimated_serialized_event_bytes",
        bytes,
        { scope: "trace", strategy: "project" },
      );
    }
  });

  it.each([
    { maxSize: 60, sizes: [22, 60, 60, 60], projectCounts: [1, 1, 1, 2] },
    { maxSize: 80, sizes: [42, 80, 80], projectCounts: [1, 1, 2] },
  ])(
    "dispatches cross-project batches capped at $maxSize independently of obsolete switches",
    async ({ maxSize, sizes, projectCounts }) => {
      env.LANGFUSE_TRACE_BATCH_MAX_SIZE = maxSize;
      const traces = Array.from(
        { length: 201 },
        (_, index) => `trace-${index}`,
      );
      await trackLegacyTopicsBatchActivity(
        "project",
        traces.map((traceId, index) => event(traceId, 1_000_000, index + 1)),
      );
      await trackLegacyTopicsBatchActivity("project", [
        event("trace-0", 1_000_000, 5),
      ]);
      await trackLegacyTopicsBatchActivity("other", [
        event("trace-0", 1_000_000, 10_000),
      ]);
      await client().zadd(
        dueKey,
        ...traces.flatMap((traceId, index) => [
          Date.now() - 1_000 + index,
          member("project", traceId),
        ]),
      );
      await makeDue("other", "trace-0");
      const add = vi.spyOn(queue, "add");
      env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
      env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED = "false";
      await trackLegacyTopicsBatchActivity("disabled", [event("ignored")]);
      await runner().processBatch();
      const jobs = await queue.getJobs(["wait"]);
      for (const job of jobs) TraceBatchEventSchema.parse(job.data);
      expect(
        jobs.map((job) => job.data.payload.traces.length).sort((a, b) => a - b),
      ).toEqual(sizes);
      expect(
        jobs
          .flatMap((job) =>
            job.data.payload.traces.map((trace) =>
              member(trace.projectId, trace.traceId),
            ),
          )
          .sort(),
      ).toEqual(
        [
          ...traces.map((traceId) => member("project", traceId)),
          member("other", "trace-0"),
        ].sort(),
      );
      expect(
        add.mock.calls.flatMap(([, job]) =>
          job.payload.traces.map((trace) =>
            member(trace.projectId, trace.traceId),
          ),
        ),
      ).toEqual([
        member("other", "trace-0"),
        ...traces.map((traceId) => member("project", traceId)),
      ]);
      expect(await client().zcard(dueKey)).toBe(0);
      expect(await client().hlen(stateKey)).toBe(0);
      expect(
        vi
          .mocked(recordDistribution)
          .mock.calls.filter(([name]) => name === "langfuse.trace_batch.size")
          .map(([, value]) => value)
          .sort((a, b) => Number(a) - Number(b)),
      ).toEqual(sizes);
      expect(
        vi
          .mocked(recordDistribution)
          .mock.calls.filter(
            ([name]) => name === "langfuse.trace_batch.project_count",
          )
          .map(([, value]) => value)
          .sort((a, b) => Number(a) - Number(b)),
      ).toEqual(projectCounts);
      for (const [metric, estimate] of [
        ["estimated_event_update_count", "count"],
        ["estimated_serialized_event_bytes", "bytes"],
      ] as const) {
        const expected = add.mock.calls.map(([, job]) =>
          job.payload.traces.reduce((total, trace) => {
            if (trace.projectId === "other")
              return total + (estimate === "count" ? 1 : 10_000);
            const index = Number(trace.traceId.replace("trace-", ""));
            const estimates =
              index === 0
                ? { count: 2, bytes: 6 }
                : { count: 1, bytes: index + 1 };
            return total + estimates[estimate];
          }, 0),
        );
        expect(
          vi
            .mocked(recordDistribution)
            .mock.calls.filter(
              ([name, , tags]) =>
                name === `langfuse.trace_batch.${metric}` &&
                tags?.scope === "batch",
            )
            .map(([, value, tags]) => ({ value, tags })),
        ).toEqual(
          expected.map((value) => ({
            value,
            tags: { scope: "batch", strategy: "project" },
          })),
        );
      }
      for (const [, job] of add.mock.calls) {
        for (const trace of job.payload.traces) {
          expect(Object.keys(trace).sort()).toEqual([
            "maxStart",
            "minStart",
            "projectId",
            "revision",
            "traceId",
          ]);
        }
      }
      await runner().processBatch();
      expect(await queue.getWaitingCount()).toBe(sizes.length);
    },
  );

  it("keeps unknown estimates through updates and late-arrival dispatch", async () => {
    const legacyStates = [
      {},
      { eventUpdateCount: 4 },
      { serializedEventBytes: 400 },
    ];
    const legacyIds = legacyStates.map((_, index) => `legacy-${index}`);
    for (const [index, estimates] of legacyStates.entries()) {
      await client().hset(
        stateKey,
        member("project", legacyIds[index]),
        JSON.stringify({
          minStart: 1_000_000,
          maxStart: 1_000_000,
          revision: randomUUID(),
          ...estimates,
        }),
      );
      await client().zadd(
        dueKey,
        Date.now() + 600_000,
        member("project", legacyIds[index]),
      );
    }
    await trackLegacyTopicsBatchActivity("project", [
      ...legacyIds.map((traceId) => event(traceId, 1_000_001, 20)),
      event("known", 1_000_000, 30),
    ]);
    await makeDue("project", ...legacyIds, "known");
    const dispatcher = runner();
    await dispatcher.processBatch();
    const [job] = await queue.getJobs(["wait"]);
    expect(
      job.data.payload.traces.map(({ traceId }) => traceId).sort(),
    ).toEqual(["known", ...legacyIds].sort());
    const estimateSamples = vi
      .mocked(recordDistribution)
      .mock.calls.filter(([name]) =>
        name.startsWith("langfuse.trace_batch.estimated_"),
      );
    expect(estimateSamples).toHaveLength(2);
    expect(estimateSamples).toEqual(
      expect.arrayContaining([
        [
          "langfuse.trace_batch.estimated_event_update_count",
          1,
          { scope: "trace", strategy: "project" },
        ],
        [
          "langfuse.trace_batch.estimated_serialized_event_bytes",
          30,
          { scope: "trace", strategy: "project" },
        ],
      ]),
    );
    for (const [scope, count] of [
      ["trace", 3],
      ["batch", 1],
    ] as const) {
      expect(
        vi
          .mocked(recordIncrement)
          .mock.calls.filter(
            ([name, , tags]) =>
              name === "langfuse.trace_batch.estimates_unavailable" &&
              tags?.scope === scope &&
              tags?.strategy === "project",
          )
          .reduce((total, [, value]) => total + Number(value), 0),
      ).toBe(count);
    }
    expect(await client().hlen(stateKey)).toBe(0);

    vi.clearAllMocks();
    await trackLegacyTopicsBatchActivity(
      "project",
      legacyIds.map((traceId) => event(traceId, 1_000_002, 20)),
    );
    for (const traceId of legacyIds) {
      const state = JSON.parse(
        (await client().hget(stateKey, member("project", traceId)))!,
      );
      expect(state.eventUpdateCount).toBeUndefined();
      expect(state.serializedEventBytes).toBeUndefined();
    }
    await makeDue("project", ...legacyIds);
    await dispatcher.processBatch();
    expect(
      vi
        .mocked(recordDistribution)
        .mock.calls.filter(([name]) =>
          name.startsWith("langfuse.trace_batch.estimated_"),
        ),
    ).toHaveLength(0);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.estimates_unavailable",
      1,
      { scope: "batch", strategy: "project" },
    );
  });

  it.each(["project", "locality"] as const)(
    "dispatches the complete due cohort across hydration chunks with %s",
    async (strategy) => {
      env.LANGFUSE_TRACE_BATCH_STRATEGY = strategy;
      const due = Date.now() - 100_000;
      const traces = Array.from({ length: 10_061 }, (_, i) => ({
        projectId: ["project-c", "project-a", "project-b"][i % 3],
        traceId: `trace-${String(i).padStart(5, "0")}`,
        due: due + Math.floor(i / 2_000) * 1_000,
      }));
      for (const projectId of ["project-c", "project-a", "project-b"]) {
        await trackLegacyTopicsBatchActivity(
          projectId,
          traces
            .filter((trace) => trace.projectId === projectId)
            .map((trace) => event(trace.traceId)),
        );
      }
      await client().zadd(
        dueKey,
        ...traces.flatMap((trace) => [
          trace.due,
          member(trace.projectId, trace.traceId),
        ]),
      );
      const add = vi.spyOn(queue, "add");
      await runner().processBatch();
      const batches = add.mock.calls.map(([, job]) => job.payload.traces);
      const assigned = batches
        .flat()
        .map((trace) => member(trace.projectId, trace.traceId));
      expect(assigned).toHaveLength(traces.length);
      expect(new Set(assigned)).toEqual(
        new Set(traces.map((trace) => member(trace.projectId, trace.traceId))),
      );
      expect(batches.every((batch) => batch.length <= 60)).toBe(true);
      const candidateSizes = vi
        .mocked(recordDistribution)
        .mock.calls.filter(
          ([name]) => name === "langfuse.trace_batch.candidate_buffer_size",
        )
        .map(([, value]) => Number(value));
      expect(Math.max(...candidateSizes)).toBeLessThanOrEqual(1059);
      if (strategy === "project") {
        expect(batches.map((batch) => batch.length)).toEqual([
          ...Array(167).fill(60),
          41,
        ]);
        const expected = traces.sort(
          (a, b) =>
            a.projectId.localeCompare(b.projectId) ||
            a.due - b.due ||
            a.traceId.localeCompare(b.traceId),
        );
        expect(
          batches.flat().map((trace) => member(trace.projectId, trace.traceId)),
        ).toEqual(
          expected.map((trace) => member(trace.projectId, trace.traceId)),
        );
      } else {
        expect(batches.length).toBeGreaterThanOrEqual(
          Math.ceil(traces.length / 60),
        );
        expect(batches.length).toBeLessThanOrEqual(
          Math.ceil(traces.length / 1000) * Math.ceil(1000 / 60),
        );
      }
      expect(await client().zcard(dueKey)).toBe(0);
      expect(await client().hlen(stateKey)).toBe(0);
    },
  );

  it("keeps project locality and a bounded partial tail across hydration chunks", async () => {
    env.LANGFUSE_TRACE_BATCH_STRATEGY = "locality";
    const traces = Array.from({ length: 2_001 }, (_, index) => ({
      projectId: index % 2 === 0 ? "project-a" : "project-b",
      traceId: `trace-${String(index).padStart(4, "0")}`,
    }));
    for (const projectId of ["project-a", "project-b"]) {
      await trackLegacyTopicsBatchActivity(
        projectId,
        traces
          .filter((trace) => trace.projectId === projectId)
          .map((trace) => event(trace.traceId)),
      );
    }
    const due = Date.now() - 1_000;
    await client().zadd(
      dueKey,
      ...traces.flatMap((trace) => [
        due,
        member(trace.projectId, trace.traceId),
      ]),
    );
    const add = vi.spyOn(queue, "add");

    await runner().processBatch();

    const batches = add.mock.calls.map(([, job]) => job.payload.traces);
    expect(batches.length).toBeGreaterThanOrEqual(
      Math.ceil(traces.length / 60),
    );
    expect(batches.length).toBeLessThanOrEqual(2 * Math.ceil(1_000 / 60) + 1);
    expect(
      batches.every((batch) => batch.length > 0 && batch.length <= 60),
    ).toBe(true);
    expect(
      batches.filter(
        (batch) => new Set(batch.map((trace) => trace.projectId)).size > 1,
      ),
    ).toHaveLength(0);
    const dispatchedMembers = batches
      .flat()
      .map((trace) => member(trace.projectId, trace.traceId));
    expect(dispatchedMembers).toHaveLength(traces.length);
    expect(new Set(dispatchedMembers)).toEqual(
      new Set(traces.map((trace) => member(trace.projectId, trace.traceId))),
    );
    expect(
      vi
        .mocked(recordIncrement)
        .mock.calls.filter(
          ([name]) => name === "langfuse.trace_batch.skipped_traces",
        )
        .map(([, value]) => value),
    ).toEqual([0, 0, 0]);
    expect(await queue.getWaitingCount()).toBe(batches.length);
    expect(await client().zcard(dueKey)).toBe(0);
    expect(await client().hlen(stateKey)).toBe(0);
  });

  it("coalesces a non-final compatible partial across a hydration boundary", async () => {
    env.LANGFUSE_TRACE_BATCH_STRATEGY = "locality";
    const minute = 60_000;
    const early = Array.from({ length: 30 }, (_, index) => ({
      traceId: `early-${String(index).padStart(2, "0")}`,
      start: 10 * minute,
    }));
    const filler = Array.from({ length: 960 }, (_, index) => ({
      traceId: `filler-${String(index).padStart(3, "0")}`,
      start: 12 * 60 * minute,
    }));
    const late = Array.from({ length: 12 }, (_, index) => ({
      traceId: `late-${String(index).padStart(2, "0")}`,
      start: 24 * 60 * minute,
    }));
    const firstWindow = [...early.slice(0, 28), ...filler, ...late];
    const traces = [...firstWindow, ...early.slice(28)];

    await trackLegacyTopicsBatchActivity(
      "project",
      traces.map(({ traceId, start }) => event(traceId, start)),
    );
    const due = Date.now() - 10_000;
    await client().zadd(
      dueKey,
      ...traces.flatMap(({ traceId }, index) => [
        due + index,
        member("project", traceId),
      ]),
    );
    const targetMember = member("project", early[0].traceId);
    const hydratedRevision = JSON.parse(
      (await client().hget(stateKey, targetMember))!,
    ).revision;
    const evaluate = client().evalsha.bind(client());
    let reactivated = false;
    vi.spyOn(client(), "evalsha").mockImplementation(async (...args) => {
      const result = await evaluate(...args);
      if (!reactivated && Number(args[1]) === 2 && args.length > 6) {
        reactivated = true;
        await trackLegacyTopicsBatchActivity("project", [
          event(early[0].traceId, 11 * minute),
        ]);
      }
      return result;
    });
    const add = vi.spyOn(queue, "add");

    await runner().processBatch();

    expect(reactivated).toBe(true);
    const batches = add.mock.calls.map(([, job]) => job.payload.traces);
    expect(
      batches
        .filter((batch) =>
          batch.some(({ traceId }) => traceId.startsWith("early-")),
        )
        .map((batch) => batch.map(({ traceId }) => traceId).sort()),
    ).toEqual([early.map(({ traceId }) => traceId)]);
    expect(batches.map((batch) => batch.length).sort((a, b) => a - b)).toEqual([
      12,
      30,
      ...Array(16).fill(60),
    ]);
    const assigned = batches
      .flatMap((batch) => batch)
      .map(({ projectId, traceId }) => member(projectId, traceId));
    expect(assigned).toHaveLength(traces.length);
    expect(new Set(assigned)).toEqual(
      new Set(traces.map(({ traceId }) => member("project", traceId))),
    );
    const candidateBufferSizes = vi
      .mocked(recordDistribution)
      .mock.calls.filter(
        ([name]) => name === "langfuse.trace_batch.candidate_buffer_size",
      )
      .map(([, value]) => Number(value));
    expect(candidateBufferSizes).toContain(42);
    expect(Math.max(...candidateBufferSizes)).toBeLessThanOrEqual(1_059);
    const current = JSON.parse((await client().hget(stateKey, targetMember))!);
    const dispatched = batches
      .flat()
      .find(({ traceId }) => traceId === early[0].traceId);
    expect(dispatched?.revision).toBe(hydratedRevision);
    expect(current.revision).not.toBe(hydratedRevision);
    expect(current.maxStart).toBe(11 * minute);
    expect(await client().zcard(dueKey)).toBe(1);
    expect(await client().hlen(stateKey)).toBe(1);

    await makeDue("project", early[0].traceId);
    await runner().processBatch();
    expect(await queue.getWaitingCount()).toBe(batches.length + 1);
    expect(await client().zcard(dueKey)).toBe(0);
    expect(await client().hlen(stateKey)).toBe(0);
  });

  it("revalidates the due ID list after deletion, missing state, reactivation and new arrivals", async () => {
    const traces = Array.from(
      { length: 2_001 },
      (_, i) => `trace-${String(i).padStart(5, "0")}`,
    );
    await trackLegacyTopicsBatchActivity(
      "project",
      traces.map((id) => event(id)),
    );
    const due = Date.now() - 1_000;
    await client().zadd(
      dueKey,
      ...traces.flatMap((id) => [due, member("project", id)]),
    );
    const range = client().zrange.bind(client());
    let changed = false;
    vi.spyOn(client(), "zrange").mockImplementation(async (...args) => {
      const result = await range(...args);
      if (!changed && args.includes("BYSCORE")) {
        changed = true;
        // Change Redis after the complete ID list has been read but before hydration.
        await client().zrem(dueKey, member("project", traces[0]));
        await client().hdel(stateKey, member("project", traces[0]));
        await client().hdel(stateKey, member("project", traces[1_000]));
        env.LANGFUSE_TRACE_BATCH_IDLE_MS = 1;
        await trackLegacyTopicsBatchActivity("project", [
          event(traces[999]),
          event("new-after-cutoff"),
        ]);
      }
      return result;
    });
    const add = vi.spyOn(queue, "add");
    await runner().processBatch();
    expect(changed).toBe(true);
    expect(
      add.mock.calls.flatMap(([, job]) =>
        job.payload.traces.map((trace) => trace.traceId),
      ),
    ).toEqual(traces.filter((_, i) => i !== 0 && i !== 999 && i !== 1_000));
    expect(
      await client().zscore(dueKey, member("project", traces[1_000])),
    ).toBeNull();
    expect((await client().hkeys(stateKey)).sort()).toEqual(
      [
        member("project", "new-after-cutoff"),
        member("project", traces[999]),
      ].sort(),
    );
  });

  it("expires abandoned pending keys natively without another ingestion or dispatcher run", async () => {
    env.LANGFUSE_TRACE_BATCH_IDLE_MS = 100;
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = 300;
    await trackLegacyTopicsBatchActivity("project", [event("abandoned")]);
    for (const key of [dueKey, stateKey]) {
      expect(await client().pttl(key)).toBeGreaterThan(0);
      expect(await client().pttl(key)).toBeLessThanOrEqual(400);
    }
    await vi.waitFor(async () => {
      expect(await client().exists(dueKey, stateKey)).toBe(0);
    });
    expect(await queue.getWaitingCount()).toBe(0);
  });

  it("extends native expiry for later activity and never shortens another pending trace's deadline", async () => {
    env.LANGFUSE_TRACE_BATCH_IDLE_MS = 10_000;
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = 60_000;
    await trackLegacyTopicsBatchActivity("project", [event("long-idle")]);
    const initialDeadline = Number(await client().pexpiretime(dueKey));
    await vi.waitFor(() =>
      expect(Date.now()).toBeGreaterThan(initialDeadline - 70_000 + 10),
    );
    env.LANGFUSE_TRACE_BATCH_IDLE_MS = 20_000;
    await trackLegacyTopicsBatchActivity("project", [event("later")]);
    const extendedDeadline = Number(await client().pexpiretime(dueKey));
    expect(extendedDeadline).toBeGreaterThan(initialDeadline);
    expect(Number(await client().pexpiretime(stateKey))).toBe(extendedDeadline);

    env.LANGFUSE_TRACE_BATCH_IDLE_MS = 1_000;
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = 1_000;
    await trackLegacyTopicsBatchActivity("project", [event("short-idle")]);
    expect(Number(await client().pexpiretime(dueKey))).toBeGreaterThanOrEqual(
      extendedDeadline,
    );
    expect(Number(await client().pexpiretime(stateKey))).toBe(
      Number(await client().pexpiretime(dueKey)),
    );
    expect(await client().zcard(dueKey)).toBe(3);
    expect(await client().hlen(stateKey)).toBe(3);

    const roundedDeadline =
      Math.ceil((Date.now() + 4 * 60 * 60_000) / 100_000_000) * 100_000_000;
    for (const key of [dueKey, stateKey])
      await client().pexpireat(key, roundedDeadline);
    vi.mocked(recordIncrement).mockClear();
    await trackLegacyTopicsBatchActivity("project", [event("rounded-expiry")]);
    expect(recordIncrement).not.toHaveBeenCalledWith(
      "langfuse.trace_batch.tracking_errors",
      expect.anything(),
    );
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.event_updates",
      1,
      { stage: "recorded" },
    );
    for (const key of [dueKey, stateKey])
      expect(Number(await client().pexpiretime(key))).toBe(roundedDeadline);
  });

  it("drains and removes queued jobs without queries when both pipelines are disabled", async () => {
    vi.mocked(isTopicsEnabled).mockReturnValue(false);
    env.LANGFUSE_TRACE_BATCH_READ_ENABLED = "true";
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
    const read = vi
      .spyOn(shared, "getTraceBatchEventStream")
      .mockImplementation(async function* () {
        throw new Error("Drain mode must not query ClickHouse");
      });
    const payload = {
      traces: [
        {
          projectId: "project",
          traceId: "trace",
          minStart: 0,
          maxStart: 1,
          revision: "r",
        },
      ],
    };
    const current = await queue.add(
      QueueJobs.TraceBatch,
      {
        id: "current",
        timestamp: new Date(),
        name: QueueJobs.TraceBatch,
        payload,
      },
      { jobId: "current", removeOnComplete: { age: 3600, count: 10000 } },
    );
    const old = await queue.add(
      QueueJobs.TraceBatch,
      {
        id: "old",
        timestamp: new Date(Date.now() - 3 * 60 * 60_000),
        name: QueueJobs.TraceBatch,
        payload,
      },
      { jobId: "old", removeOnComplete: { age: 3600, count: 10000 } },
    );
    const worker = new Worker(queue.name, traceBatchQueueProcessor, {
      connection,
      prefix: getQueuePrefix(queue.name),
    });
    try {
      await vi.waitFor(async () => {
        expect(await queue.getJob(current.id!)).toBeUndefined();
        expect(await queue.getJob(old.id!)).toBeUndefined();
      });
      expect(
        await queue.getJobCounts("wait", "active", "completed", "failed"),
      ).toEqual({ wait: 0, active: 0, completed: 0, failed: 0 });
      expect(read).not.toHaveBeenCalled();
    } finally {
      await worker.close();
    }
  });

  it("expires bounded pending state during ingestion without dispatch and preserves refreshed traces", async () => {
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = 60_000;
    const expired = Array.from({ length: 1_001 }, (_, i) =>
      event(`expired-${i}`),
    );
    await trackLegacyTopicsBatchActivity("project", [
      ...expired,
      event("refreshed"),
      event("recent"),
    ]);
    const cutoff = Date.now() - 70_000;
    await client().zadd(
      dueKey,
      ...expired.flatMap(({ traceId }) => [cutoff, member("project", traceId)]),
      cutoff,
      member("project", "refreshed"),
    );
    await makeDue("project", "recent");
    await trackLegacyTopicsBatchActivity("project", [
      event("refreshed", 2_000_000),
    ]);
    const pending = await client().zcard(dueKey);
    expect(pending).toBeGreaterThan(2);
    expect(pending).toBeLessThan(expired.length + 2);
    expect(await client().hlen(stateKey)).toBe(pending);
    expect(
      await client().hget(stateKey, member("project", "recent")),
    ).not.toBeNull();
    expect(
      Number(await client().zscore(dueKey, member("project", "refreshed"))),
    ).toBeGreaterThan(Date.now());
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.expired_traces",
      expired.length + 2 - pending,
      { source: "ingestion" },
    );
    await vi.waitFor(async () => {
      await trackLegacyTopicsBatchActivity("project", [
        event("refreshed", 3_000_000),
      ]);
      expect(await client().zcard(dueKey)).toBe(2);
    });
    expect((await client().hkeys(stateKey)).sort()).toEqual([
      member("project", "recent"),
      member("project", "refreshed"),
    ]);
    expect(await client().zcard(dueKey)).toBe(2);
    const expirySamples = vi
      .mocked(recordIncrement)
      .mock.calls.filter(
        ([name, , tags]) =>
          name === "langfuse.trace_batch.expired_traces" &&
          tags?.source === "ingestion",
      )
      .map(([, count]) => count);
    expect(expirySamples.reduce((sum, count) => sum + count, 0)).toBe(
      expired.length,
    );
    expect(expirySamples.every((count) => count < expired.length)).toBe(true);
    expect(await queue.getWaitingCount()).toBe(0);
  });

  it("cleans an expired backlog in bounded pages without queueing expired traces", async () => {
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS = 60_000;
    const expired = Array.from({ length: 10_001 }, (_, i) =>
      event(`expired-${i}`),
    );
    await trackLegacyTopicsBatchActivity("project", [
      ...expired,
      event("ready"),
    ]);
    await client().zadd(
      dueKey,
      ...expired.flatMap(({ traceId }) => [
        Date.now() - 70_000,
        member("project", traceId),
      ]),
    );
    await makeDue("project", "ready");
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
    const dispatcher = runner();
    await dispatcher.processBatch();
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.expired_traces",
      expect.any(Number),
      { source: "dispatcher" },
    );
    expect(
      vi
        .mocked(recordIncrement)
        .mock.calls.filter(
          ([name]) => name === "langfuse.trace_batch.expired_traces",
        )
        .every(([, count]) => count <= 1_000),
    ).toBe(true);
    const jobs = await queue.getJobs(["wait"]);
    expect(
      jobs.flatMap((job) =>
        job.data.payload.traces.map((trace) => trace.traceId),
      ),
    ).toEqual(["ready"]);
    expect(await client().hlen(stateKey)).toBe(0);
    expect(await client().zcard(dueKey)).toBe(0);
    expect(
      vi
        .mocked(recordIncrement)
        .mock.calls.filter(
          ([name]) => name === "langfuse.trace_batch.expired_traces",
        )
        .reduce((sum, [, value]) => sum + value, 0),
    ).toBe(10_001);
  });

  it.each(["project", "locality"] as const)(
    "keeps due state on enqueue failure and retries it with %s",
    async (strategy) => {
      env.LANGFUSE_TRACE_BATCH_STRATEGY = strategy;
      await trackLegacyTopicsBatchActivity("project", [event("trace")]);
      await makeDue("project", "trace");
      vi.spyOn(queue, "add").mockRejectedValueOnce(
        new Error("enqueue unavailable"),
      );
      const dispatcher = runner();
      await dispatcher.processBatch();
      expect(await client().zcard(dueKey)).toBe(1);
      expect(await client().hlen(stateKey)).toBe(1);
      await dispatcher.processBatch();
      expect(await queue.getWaitingCount()).toBe(1);
      expect(await client().zcard(dueKey)).toBe(0);
    },
  );

  it("acknowledges successful jobs when a later enqueue fails", async () => {
    env.LANGFUSE_TRACE_BATCH_MAX_SIZE = 1;
    await trackLegacyTopicsBatchActivity("project", [
      event("first"),
      event("second"),
    ]);
    await makeDue("project", "first", "second");
    const add = queue.add.bind(queue);
    vi.spyOn(queue, "add")
      .mockImplementationOnce((...args) => add(...args))
      .mockRejectedValueOnce(new Error("enqueue unavailable"));
    const dispatcher = runner();
    await dispatcher.processBatch();
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().zcard(dueKey)).toBe(1);
    expect(await client().hlen(stateKey)).toBe(1);
    await dispatcher.processBatch();
    expect(await queue.getWaitingCount()).toBe(2);
    expect(await client().zcard(dueKey)).toBe(0);
    expect(await client().hlen(stateKey)).toBe(0);
  });

  it.each(["updated", "deleted", "expired"] as const)(
    "preserves arrivals during enqueue, including deleted/recreated state: %s",
    async (mode) => {
      await trackLegacyTopicsBatchActivity("project", [event("trace")]);
      await makeDue("project", "trace");
      const add = queue.add.bind(queue);
      vi.spyOn(queue, "add").mockImplementationOnce(async (...args) => {
        const job = await add(...args);
        if (mode === "deleted")
          await client().hdel(stateKey, member("project", "trace"));
        if (mode === "expired") {
          await client().zadd(dueKey, 0, member("project", "trace"));
          await trackLegacyTopicsBatchActivity("other", [event("trigger")]);
          expect(
            await client().hget(stateKey, member("project", "trace")),
          ).toBeNull();
          await client().zrem(dueKey, member("other", "trigger"));
          await client().hdel(stateKey, member("other", "trigger"));
        }
        await trackLegacyTopicsBatchActivity("project", [
          event("trace", 2_000_000),
        ]);
        return job;
      });
      const dispatcher = runner();
      await dispatcher.processBatch();
      expect(await queue.getWaitingCount()).toBe(1);
      expect(await client().zcard(dueKey)).toBe(1);
      const current = JSON.parse(
        (await client().hget(stateKey, member("project", "trace")))!,
      );
      const [job] = await queue.getJobs(["wait"]);
      expect(current.revision).not.toBe(job.data.payload.traces[0].revision);
      expect(current.maxStart).toBe(2_000_000);
      expect(current).toMatchObject({
        eventUpdateCount: 2,
        serializedEventBytes: 200,
      });
      await makeDue("project", "trace");
      await dispatcher.processBatch();
      expect(await queue.getWaitingCount()).toBe(2);
      expect(await client().hlen(stateKey)).toBe(0);
    },
  );

  it("reuses a queued batch when its acknowledgement fails", async () => {
    await trackLegacyTopicsBatchActivity("project", [event("trace")]);
    await makeDue("project", "trace");
    await trackLegacyTopicsBatchActivity("other", [event("trace")]);
    await makeDue("other", "trace");
    const add = queue.add.bind(queue);
    vi.spyOn(queue, "add").mockImplementationOnce(async (...args) => {
      const job = await add(...args);
      // The next Redis operation is the post-enqueue acknowledgement.
      vi.spyOn(client(), "evalsha").mockRejectedValueOnce(
        new Error("ACK unavailable"),
      );
      return job;
    });
    const dispatcher = runner();
    await dispatcher.processBatch();
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().hlen(stateKey)).toBe(2);
    await dispatcher.processBatch();
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().hlen(stateKey)).toBe(0);
    const [job] = await queue.getJobs(["wait"]);
    expect(
      job.data.payload.traces
        .map((trace) => member(trace.projectId, trace.traceId))
        .sort(),
    ).toEqual([member("other", "trace"), member("project", "trace")]);
  });

  it("subtracts dispatcher runtime from the next delay and catches up after an overrun", async () => {
    let clock = Date.now();
    const interval = env.LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS;
    let elapsed = Math.floor(interval / 2);
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const range = client().zrange.bind(client());
    vi.spyOn(client(), "zrange").mockImplementation(async (...args) => {
      const result = await range(...args);
      if (args.includes("BYSCORE")) clock += elapsed;
      return result;
    });
    const dispatcher = runner();
    expect(await dispatcher.processBatch()).toBe(interval - elapsed);
    elapsed = interval + 1_000;
    expect(await dispatcher.processBatch()).toBe(0);
  });

  it("bounds shutdown when an in-flight enqueue stalls and remains stopped after recovery", async () => {
    await trackLegacyTopicsBatchActivity("project", [event("trace")]);
    await makeDue("project", "trace");
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const add = queue.add.bind(queue);
    vi.spyOn(queue, "add").mockImplementationOnce(async (...args) => {
      entered.resolve();
      await release.promise;
      return add(...args);
    });
    const dispatcher = runner();
    const active = dispatcher.processBatch();
    await entered.promise;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let drained = false;
    const drain = dispatcher.drain().then(() => {
      drained = true;
    });
    try {
      await vi.advanceTimersByTimeAsync(4_999);
      expect(drained).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(drained).toBe(true);
    } finally {
      vi.useRealTimers();
      release.resolve();
      await Promise.all([active, drain]);
    }
    await trackLegacyTopicsBatchActivity("project", [event("next")]);
    await makeDue("project", "next");
    await dispatcher.processBatch();
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(await client().hlen(stateKey)).toBe(1);
  });

  it("allows only one dispatcher and waits for its in-flight enqueue before shutdown", async () => {
    env.LANGFUSE_TRACE_BATCH_MAX_SIZE = 1;
    const traces = ["trace"];
    await trackLegacyTopicsBatchActivity(
      "project",
      traces.map((traceId) => event(traceId)),
    );
    await makeDue("project", ...traces);
    await trackLegacyTopicsBatchActivity("other", [event("trace")]);
    await makeDue("other", "trace");
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const add = queue.add.bind(queue);
    vi.spyOn(queue, "add").mockImplementationOnce(async (...args) => {
      entered.resolve();
      await release.promise;
      return add(...args);
    });
    const first = runner();
    const active = first.processBatch();
    await entered.promise;
    await runner().processBatch();
    expect(queue.add).toHaveBeenCalledTimes(1);
    let drained = false;
    const drain = first.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    release.resolve();
    await Promise.all([active, drain]);
    expect(drained).toBe(true);
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().hlen(stateKey)).toBe(1);
    await first.processBatch();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});
