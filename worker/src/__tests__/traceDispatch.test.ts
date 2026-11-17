/* eslint-disable @repo/no-exotic-operators */
import calculateSlot from "cluster-key-slot";
import { createHash, randomUUID } from "node:crypto";
import { Queue } from "bullmq";
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
  createEvent,
  createEventsCh,
  createNewRedisInstance,
  EventsDispatchQueue,
  getTopicSetupTraceBounds,
  getQueuePrefix,
  QueueJobs,
  QueueName,
  recordDistribution,
  recordGauge,
  recordIncrement,
  redis,
  EventsDispatchEventSchema,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import * as shared from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";
import { TraceBatchMetricsRunner } from "../features/traceBatching/TraceBatchMetricsRunner";
import { getTraceBatchShard } from "../features/traceBatching/traceBatchReadiness";
import { TraceBatchDispatcher } from "../features/traceBatching/traceBatching";
import {
  ACKNOWLEDGE_RECORDING_SCRIPT,
  getRecordingBoundsKey,
  getRecordingKeys,
  getRecordingTag,
  HYDRATE_RECORDING_SCRIPT,
  recordTraceActivity,
  seedTraceDispatch,
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
import {
  getTopicsProcessingSampling,
  isTopicsProcessingActive,
  type TopicsModels,
} from "@langfuse/shared/topics/server";
import {
  traceDispatchConfig,
  eventsDispatchConfig,
} from "../features/eventsDispatch/config";

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
    getTracingReadinessSettings: vi.fn(original.getTracingReadinessSettings),
  };
});

const topicsProjects = vi.hoisted(() => new Set<string>());
vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/topics/server")>()),
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
    const expected = selectTraceBatches(candidates, 3);

    expect(expected.flat().map(({ trace }) => trace.traceId)).toEqual([
      "trace-1",
      "trace-0",
      "trace-4",
      "trace-3",
    ]);
    expect(selectTraceBatches(candidates.toReversed(), 3)).toEqual(expected);
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

    const batches = selectTraceBatches([...late, ...early], 60);

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

    const batches = selectTraceBatches([...projectB, ...projectA], 60);

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

    const batches = selectTraceBatches(candidates.toReversed(), 3);

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

    expect(ids(selectTraceBatches(candidates, 60))).toEqual(
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
      expect(ids(selectTraceBatches(cohorts.flat().toReversed(), cap))).toEqual(
        ids(cohorts),
      );
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

    const batches = selectTraceBatches([wouldChain, compatible, seed], 60);

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
    const canonical = selectTraceBatches(candidates, 3)[0];

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
      serializedEventBytes: number,
    ): PendingTrace => ({
      ...pendingTrace("project", traceId, 1, 0, minute),
      estimates: { serializedEventBytes },
    });
    const limits = { maxSerializedEventBytes: 10_000 };
    const bytesOf = (batch: PendingTrace[]) =>
      batch.reduce(
        (total, { estimates }) =>
          total + (estimates?.serializedEventBytes ?? 0),
        0,
      );

    it("closes batches before the byte budget and isolates overweight traces", () => {
      const candidates = [
        weighted("a", 4_000),
        weighted("b", 4_000),
        weighted("c", 4_000),
        weighted("heavy", 25_000),
        weighted("bytes-1", 30_000),
        weighted("bytes-2", 30_000),
        { ...pendingTrace("project", "unknown", 1, 0, minute) },
      ];

      const batches = selectTraceBatches(candidates, 60, limits);

      expect(batches.flat()).toHaveLength(candidates.length);
      for (const batch of batches) {
        if (batch.length === 1) continue;
        expect(bytesOf(batch)).toBeLessThanOrEqual(
          limits.maxSerializedEventBytes,
        );
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
      expect(selectTraceBatches(candidates, 60)).toHaveLength(1);
    });

    it("packs light locality neighbors of a heavy trace into full batches", () => {
      const at = (
        traceId: string,
        start: number,
        serializedEventBytes: number,
      ): PendingTrace => ({
        ...pendingTrace("project", traceId, 1, start, start),
        estimates: { serializedEventBytes },
      });
      // Locality order: two light traces, the heavy trace, six light traces.
      const candidates = [
        at("light-0", 0, 1_000),
        at("light-1", 0, 1_000),
        at("heavy", minute, 9_000),
        ...Array.from({ length: 6 }, (_, index) =>
          at(`light-${index + 2}`, 2 * minute, 1_000),
        ),
      ];

      const batches = selectTraceBatches(candidates, 4, limits);

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
        [
          [weighted("a", 6_000)],
          [weighted("b", 6_000)],
          [weighted("c", 4_000)],
        ],
        60,
        limits,
      );
      const all = [...result.dispatch, ...result.carry];

      expect(all.flat()).toHaveLength(3);
      expect(all.every((batch) => bytesOf(batch) <= 10_000)).toBe(true);
      expect(all).toHaveLength(2);
    });
  });
});

describe("trace-dispatch shard tags", () => {
  it("places each shard's hash tag in its own share of the cluster slot space", () => {
    const originalCount = traceDispatchConfig.shardCount;
    traceDispatchConfig.shardCount = 16;
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
      traceDispatchConfig.shardCount = originalCount;
    }
  });
});

describe("trace micro-batch scheduling with Redis", () => {
  // Recent base for start times; the dispatcher excludes starts over a year old.
  const T0 = Date.now() - 2 * 60 * 60_000;
  // Recording tags depend on the shard count; these tests run with one shard.
  const originalShards = traceDispatchConfig.shardCount;
  traceDispatchConfig.shardCount = 1;
  const recordingKeys = getRecordingKeys(0);
  const recordingBoundsKeys = new Map<number, Buffer[]>();
  const originalEventsDispatchEnabled = env.LANGFUSE_EVENTS_DISPATCH_ENABLED;
  const originalDispatchSamplingRate =
    env.LANGFUSE_EVENTS_DISPATCH_SAMPLING_RATE_EXPERIMENTAL;
  const originalBoundsTtl = traceDispatchConfig.boundsTtlMs;
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalMaxSize = env.LANGFUSE_EVENTS_DISPATCH_MAX_BATCH_SIZE;
  const originalMaxBatchBytes = eventsDispatchConfig.maxBatchBytes;
  const originalPendingTtl = traceDispatchConfig.pendingTtlMs;
  const originalIdle = traceDispatchConfig.defaultIdleMs;
  const originalMaxTraceBytes = eventsDispatchConfig.maxTraceBytes;
  let queue: Queue<TQueueJobTypes[QueueName.EventsDispatch]>;
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
  const spanActivity = (
    traceId: string,
    start = T0 + 1_000_000,
    serializedEventBytes = 100,
  ) => ({
    traceId,
    spanStartTimeISO: new Date(start).toISOString(),
    serializedEventBytes,
  });
  const matched = (...args: Parameters<typeof spanActivity>) => ({
    ...spanActivity(...args),
    ruleIds: ["rule"],
  });
  const runner = () => {
    const instance = new TraceBatchDispatcher();
    runners.push(instance);
    return instance;
  };
  async function makeDue(projectId: string, ...traceIds: string[]) {
    for (const traceId of traceIds)
      await client().zadd(
        recordingKeys.due,
        Date.now() - 10_000,
        member(projectId, traceId),
      );
  }

  async function clearReadiness() {
    // Redis Cluster rejects multi-key commands across hash tags; delete per slot.
    for (const keys of recordingBoundsKeys.values())
      await client().del(...keys);
    recordingBoundsKeys.clear();
    for (let shard = 0; shard < traceDispatchConfig.shardCount; shard++) {
      const recording = getRecordingKeys(shard);
      await client().del(recording.due, recording.pending);
    }
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
    // vitest loads the root .env; pin the dispatcher's target queue.
    env.LANGFUSE_EVENTS_DISPATCH_ENABLED = "true";
    env.LANGFUSE_EVENTS_DISPATCH_SAMPLING_RATE_EXPERIMENTAL = 0;
    traceDispatchConfig.boundsTtlMs = 86_400_000;
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    env.LANGFUSE_EVENTS_DISPATCH_MAX_BATCH_SIZE = 60;
    traceDispatchConfig.defaultIdleMs = 600_000;
    traceDispatchConfig.pendingTtlMs = 7_200_000;
    traceDispatchConfig.shardCount = 1;
    // The unset default is 2 minutes on DEV; pin the production idle time.
    traceDispatchConfig.defaultIdleMs = 600_000;
    await clearReadiness();
    const redisConnection = createNewRedisInstance();
    if (!redisConnection) throw new Error("Redis is required for this test");
    connection = redisConnection;
    const name = `trace-batch-test-${randomUUID()}`;
    queue = new Queue(name, { connection, prefix: getQueuePrefix(name) });
    await queue.waitUntilReady();
    vi.spyOn(EventsDispatchQueue, "getInstance").mockReturnValue(
      queue as unknown as ReturnType<typeof EventsDispatchQueue.getInstance>,
    );
  });

  afterEach(async () => {
    for (const dispatcher of runners) await dispatcher.drain();
    runners.length = 0;
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(shared.getTracingReadinessSettings).mockReset();
    await clearReadiness();
    topicsProjects.clear();
    env.LANGFUSE_EVENTS_DISPATCH_ENABLED = originalEventsDispatchEnabled;
    env.LANGFUSE_EVENTS_DISPATCH_SAMPLING_RATE_EXPERIMENTAL =
      originalDispatchSamplingRate;
    traceDispatchConfig.boundsTtlMs = originalBoundsTtl;
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    env.LANGFUSE_EVENTS_DISPATCH_MAX_BATCH_SIZE = originalMaxSize;
    eventsDispatchConfig.maxBatchBytes = originalMaxBatchBytes;
    traceDispatchConfig.pendingTtlMs = originalPendingTtl;
    traceDispatchConfig.defaultIdleMs = originalIdle;
    traceDispatchConfig.shardCount = originalShards;
    eventsDispatchConfig.maxTraceBytes = originalMaxTraceBytes;
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
    // PX is set from the Redis clock, which can differ from Date.now().
    const redisNow = async () => {
      const [seconds, microseconds] = await client().time();
      return Number(seconds) * 1_000 + Math.floor(Number(microseconds) / 1_000);
    };
    const before = await redisNow();
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
      before + traceDispatchConfig.boundsTtlMs,
    );
    expect(expiry).toBeLessThanOrEqual(
      (await redisNow()) + traceDispatchConfig.boundsTtlMs,
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
    ).toBeGreaterThanOrEqual(before + traceDispatchConfig.defaultIdleMs);
  });

  it("uses the capped project idle time when recording matches and later nonmatching spans", async () => {
    vi.mocked(shared.getTracingReadinessSettings).mockResolvedValue({
      traceIdleMs: 120_000,
    });
    traceDispatchConfig.pendingTtlMs = 90_000;
    const idleMs =
      traceDispatchConfig.pendingTtlMs - traceDispatchConfig.dispatchIntervalMs;
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
    const later = await redisNow();
    await client().zadd(recordingKeys.due, later - 1_000, identity);
    await recordActivity("project", [
      { ...spanActivity("recorded", T0 + 2_000_000), ruleIds: [] },
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
      { ...spanActivity("recorded", T0 + 1_000_000, 10), ruleIds: [] },
    ]);
    expect(await client().hget(recordingKeys.pending, identity)).toBeNull();
    expect(await client().zscore(recordingKeys.due, identity)).toBeNull();

    await Promise.all([
      recordActivity("project", [
        {
          ...spanActivity("recorded", T0 + 2_000_000, 20),
          ruleIds: ["rule-a"],
        },
        {
          ...spanActivity("recorded", T0 + 4_000_000, 30),
          ruleIds: ["rule-a"],
        },
      ]),
      recordActivity("project", [
        {
          ...spanActivity("recorded", T0 + 500_000, 40),
          ruleIds: ["rule-b", "rule-a"],
        },
      ]),
    ]);
    const bounds = await readRecordedBounds(identity);
    expect(bounds.value).toMatchObject({
      minStart: T0 + 500_000,
      maxStart: T0 + 4_000_000,
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
      { ...spanActivity("recorded", T0 + 1_000_000, 10), ruleIds: ["rule"] },
    ]);
    expect((await readBounds()).serializedEventBytes).toBe(10);

    await recordActivity("project", [
      { ...spanActivity("recorded", T0 + 1_000_000, 20), ruleIds: [] },
      { ...spanActivity("recorded", T0 + 2_000_000, 30), ruleIds: [] },
    ]);
    expect((await readBounds()).serializedEventBytes).toBe(60);
    await recordActivity("project", [
      { ...spanActivity("recorded", T0 + 1_000_000, 40), ruleIds: [] },
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
        {
          ...spanActivity("recorded", T0 + 1_000_000, 80),
          ruleIds: ["old-rule"],
        },
      ]);
      if (expired === "bounds") {
        // Bounds may expire while the record is still pending.
        await client().pexpireat((await readRecordedBounds(identity)).key, 1);
      } else {
        await client().zadd(recordingKeys.due, 1, identity);
      }

      await recordActivity("project", [
        { ...spanActivity("recorded", T0 + 2_000_000, 50), ruleIds: [] },
      ]);
      const bounds = (await readRecordedBounds(identity)).value;
      // Expired bounds restart the byte total; pending expiry alone keeps the history.
      expect(bounds).toMatchObject({
        minStart: expired === "bounds" ? T0 + 2_000_000 : T0 + 1_000_000,
        maxStart: T0 + 2_000_000,
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
    // Each write reclaims at most 100 pending entries.
    for (let i = 0; i < 2; i++) {
      await recordActivity("project", [
        { ...spanActivity("refreshed", T0 + 2_000_000), ruleIds: [] },
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
    ).toMatchObject({ minStart: T0 + 1_000_000 });
    expect(await queue.getWaitingCount()).toBe(0);
  });

  it("expires recording keys without a dispatcher and preserves later pending deadlines", async () => {
    vi.spyOn(shared, "getTracingReadinessSettings").mockResolvedValue({
      traceIdleMs: null,
    });
    traceDispatchConfig.defaultIdleMs = 200;
    traceDispatchConfig.pendingTtlMs = 100;
    traceDispatchConfig.boundsTtlMs = 100;
    await recordActivity("project", [
      { ...spanActivity("first"), ruleIds: ["rule"] },
    ]);
    const deadline = Number(
      await client().call("PEXPIRETIME", recordingKeys.due),
    );
    expect(deadline).toBeGreaterThan(Date.now());
    traceDispatchConfig.defaultIdleMs = 1;
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

  it("dispatches recording maps across shards with bounded reads", async () => {
    traceDispatchConfig.shardCount = 2;
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
    expect(job.name).toBe(QueueJobs.EventsDispatchJob);
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
    const identity = member("project", "recorded");
    await recordActivity("project", [
      { ...spanActivity("recorded", T0 + 1_000, 10), ruleIds: ["rule"] },
    ]);
    await client().zadd(recordingKeys.due, Date.now() - 1_000, identity);
    const add = queue.add.bind(queue);
    vi.spyOn(queue, "add").mockImplementationOnce(async (...args) => {
      const job = await add(...args);
      await recordActivity("project", [
        { ...spanActivity("recorded", T0 + 2_000, 20), ruleIds: [] },
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
      minStart: T0 + 1_000,
      maxStart: T0 + 2_000,
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

  it("dispatches seeded traces with their rule and merges them into live activity", async () => {
    const live = member("project", "live");
    const stored = member("project", "stored");
    await recordActivity("project", [
      { ...spanActivity("live", T0 + 2_000, 300), ruleIds: ["live-rule"] },
    ]);
    recordingBoundsKeys.get(0)!.push(getRecordingBoundsKey(0, stored));
    const liveDue = Number(await client().zscore(recordingKeys.due, live));

    await seedTraceDispatch(
      "project",
      [
        {
          traceId: "live",
          minStart: T0 + 1_000,
          maxStart: T0 + 2_000,
          serializedEventBytes: 200,
        },
        {
          traceId: "stored",
          minStart: T0,
          maxStart: T0 + 5_000,
          serializedEventBytes: 50,
        },
      ],
      ["setup-rule"],
      20_000,
    );

    // Live activity keeps its later due time and its byte count, which already includes the seeded spans.
    expect(Number(await client().zscore(recordingKeys.due, live))).toBe(
      liveDue,
    );
    expect((await readRecordedBounds(live)).value).toEqual({
      minStart: T0 + 1_000,
      maxStart: T0 + 2_000,
      serializedEventBytes: 300,
    });
    const storedDue = Number(await client().zscore(recordingKeys.due, stored));
    expect(storedDue).toBeGreaterThan(Date.now());
    expect(storedDue).toBeLessThan(liveDue);

    for (const identity of [live, stored])
      await client().zadd(recordingKeys.due, Date.now() - 1_000, identity);
    await runner().processBatch();
    const [job] = await queue.getJobs(["wait"]);
    expect(
      Object.fromEntries(
        job.data.payload.traces.map((trace) => [trace.traceId, trace.ruleIds]),
      ),
    ).toEqual({ live: ["live-rule", "setup-rule"], stored: ["setup-rule"] });
  });

  it("spreads seeded traces' due times and keeps the maps alive past the last one", async () => {
    const traceIds = ["s0", "s1", "s2", "s3"];
    recordingBoundsKeys.set(
      0,
      traceIds.map((id) => getRecordingBoundsKey(0, member("project", id))),
    );
    const before = Date.now();
    await seedTraceDispatch(
      "project",
      traceIds.map((traceId) => ({
        traceId,
        minStart: T0,
        maxStart: T0,
        serializedEventBytes: 10,
      })),
      ["setup-rule"],
      20_000,
      60_000,
    );
    const dues = await Promise.all(
      traceIds.map(async (id) =>
        Number(await client().zscore(recordingKeys.due, member("project", id))),
      ),
    );
    // Offsets 20 s, 35 s, 50 s, 65 s from Redis' clock.
    expect(dues[0] - before).toBeGreaterThanOrEqual(19_000);
    expect(dues[0] - before).toBeLessThan(25_000);
    for (let i = 1; i < dues.length; i++)
      expect(dues[i] - dues[i - 1]).toBe(15_000);
    for (const key of [recordingKeys.pending, recordingKeys.due])
      expect(await client().pexpiretime(key)).toBe(
        dues[3] + traceDispatchConfig.pendingTtlMs,
      );
  });

  it("rebuilds a stored trace's dispatch state from ClickHouse for setup", async () => {
    const projectId = randomUUID();
    const identity = member(projectId, "stored");
    recordingBoundsKeys.set(0, [getRecordingBoundsKey(0, identity)]);
    const starts = [T0 + 1_000, T0 + 50_000];
    await createEventsCh(
      starts.map((start) =>
        createEvent({
          project_id: projectId,
          trace_id: "stored",
          start_time: new Date(start),
          event_ts: new Date(start),
        }),
      ),
    );

    const bounds = await getTopicSetupTraceBounds({
      projectId,
      traceIds: ["stored"],
      from: new Date(T0),
    });
    await seedTraceDispatch(projectId, bounds, ["setup-rule"], 20_000);
    await client().zadd(recordingKeys.due, Date.now() - 1_000, identity);
    await runner().processBatch();

    const [job] = await queue.getJobs(["wait"]);
    expect(job.name).toBe(QueueJobs.EventsDispatchJob);
    // The events-dispatch read covers the whole stored trace.
    expect(job.data.payload.traces).toEqual([
      expect.objectContaining({
        traceId: "stored",
        minStart: starts[0],
        maxStart: starts[1],
        serializedEventBytes: bounds[0].serializedEventBytes,
        ruleIds: ["setup-rule"],
      }),
    ]);
  });

  it("keeps recording state on enqueue failure and retries it", async () => {
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
          { ...spanActivity("reactivated", T0 + 2_000_000), ruleIds: [] },
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
      minStart: T0 + 1_000_000,
      maxStart: T0 + 1_000_000,
    });
    expect(await client().hkeys(recordingKeys.pending)).toEqual([
      member("project", "reactivated"),
    ]);
    expect(await client().zrange(recordingKeys.due, 0, -1)).toEqual([
      member("project", "reactivated"),
    ]);
  });

  it("uses recorded bytes without event counts for batch and trace limits", async () => {
    eventsDispatchConfig.maxBatchBytes = 100;
    eventsDispatchConfig.maxTraceBytes = 100;
    await recordActivity("project", [
      { ...spanActivity("first", T0 + 1_000, 60), ruleIds: ["rule"] },
      { ...spanActivity("second", T0 + 1_000, 60), ruleIds: ["rule"] },
      { ...spanActivity("oversized", T0 + 1_000, 101), ruleIds: ["rule"] },
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
        .flatMap((job) => job.data.payload.traces.map(({ traceId }) => traceId))
        .sort(),
    ).toEqual(["first", "second"]);
    expect(await client().hlen(recordingKeys.pending)).toBe(0);
    expect(await client().zcard(recordingKeys.due)).toBe(0);
    expect(
      (await readRecordedBounds(member("project", "oversized"))).value
        .serializedEventBytes,
    ).toBe(101);
  });

  it("distributes skewed projects by trace and dispatches every shard with single-slot scripts", async () => {
    const shardCount = 64;
    traceDispatchConfig.shardCount = shardCount;
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
      const size = project === 0 ? 600 : 140;
      await recordActivity(
        `project-${project}`,
        Array.from({ length: size }, (_, i) =>
          matched(`trace-${project}-${i}`),
        ),
      );
    }
    const counts = [];
    for (let shard = 0; shard < shardCount; shard++) {
      const { due } = getRecordingKeys(shard);
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

  it("packs one project's traces across readiness shards", async () => {
    traceDispatchConfig.shardCount = 16;
    const traceIds = Array.from(
      { length: 60 },
      (_, index) => `cross-shard-${index}`,
    );
    await recordActivity(
      "project",
      traceIds.map((traceId) => matched(traceId)),
    );
    for (const traceId of traceIds) {
      const entry = member("project", traceId);
      await client().zadd(
        getRecordingKeys(getTraceBatchShard(entry)).due,
        Date.now() - 1_000,
        entry,
      );
    }
    await runner().processBatch();
    const jobs = await queue.getJobs(["wait"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data.payload.traces).toHaveLength(60);
    for (let shard = 0; shard < 16; shard++) {
      const { due, pending } = getRecordingKeys(shard);
      expect(await client().zcard(due)).toBe(0);
      expect(await client().hlen(pending)).toBe(0);
    }
  });

  it("acknowledges enqueued batches by shard across a hydration window", async () => {
    traceDispatchConfig.shardCount = 16;
    env.LANGFUSE_EVENTS_DISPATCH_MAX_BATCH_SIZE = 30;
    const traceIds = Array.from(
      { length: 120 },
      (_, index) => `trace-${index}`,
    );
    await recordActivity(
      "project",
      traceIds.map((traceId) => matched(traceId)),
    );
    for (const traceId of traceIds) {
      const entry = member("project", traceId);
      await client().zadd(
        getRecordingKeys(getTraceBatchShard(entry)).due,
        Date.now() - 1_000,
        entry,
      );
    }
    const evaluate = vi.spyOn(client(), "evalsha");
    await runner().processBatch();
    expect(await queue.getWaitingCount()).toBe(4);
    const acknowledgeSha = createHash("sha1")
      .update(ACKNOWLEDGE_RECORDING_SCRIPT)
      .digest("hex");
    const acknowledgements = evaluate.mock.calls.filter(
      ([sha]) => sha === acknowledgeSha,
    );
    expect(acknowledgements.length).toBeLessThanOrEqual(16);
    for (let shard = 0; shard < 16; shard++) {
      const { due, pending } = getRecordingKeys(shard);
      expect(await client().zcard(due)).toBe(0);
      expect(await client().hlen(pending)).toBe(0);
    }
  });

  it("samples recording map memory and paused/delayed queue work, then reports drained zeros", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    await recordActivity("project", [
      { ...spanActivity("trace"), ruleIds: ["rule"] },
    ]);
    const data = {
      id: randomUUID(),
      name: QueueJobs.EventsDispatchJob,
      timestamp: new Date(now),
      payload: { traces: [] },
    };
    const waiting = await queue.add(QueueJobs.EventsDispatchJob, data, {
      timestamp: now - 5_000,
    });
    await queue.add(QueueJobs.EventsDispatchJob, data, {
      timestamp: now - 1_000,
    });
    await queue.add(QueueJobs.EventsDispatchJob, data, { delay: 120_000 });
    await queue.pause();
    // Age collection must not fetch or parse the batch payload.
    await connection.hset(queue.toKey(waiting.id!), "data", "invalid JSON");
    const metrics = new TraceBatchMetricsRunner();
    const evaluate = vi.spyOn(client(), "eval");
    await metrics["execute"]();

    for (const key of ["due", "pending"]) {
      expect(recordGauge).toHaveBeenCalledWith(
        "langfuse.trace_dispatch.redis_key_entries",
        1,
        { key, shard: "total", unit: "records" },
      );
      const sample = vi
        .mocked(recordGauge)
        .mock.calls.find(
          ([name, , tags]) =>
            name === "langfuse.trace_dispatch.redis_key_bytes" &&
            tags?.key === key,
        );
      expect(Number(sample?.[1])).toBeGreaterThan(0);
    }
    expect(recordGauge).toHaveBeenCalledWith(
      "langfuse.trace_dispatch.redis_key_bytes",
      expect.any(Number),
      { key: "bounds", shard: "sampled_mean", unit: "bytes" },
    );
    expect(recordGauge).toHaveBeenCalledWith(
      "langfuse.events_dispatch.queue_depth",
      1,
      { type: "delayed", unit: "records" },
    );
    expect(recordGauge).not.toHaveBeenCalledWith(
      "langfuse.events_dispatch.queue_depth",
      expect.anything(),
      expect.objectContaining({ type: "waiting" }),
    );
    expect(recordGauge).toHaveBeenCalledWith(
      "langfuse.events_dispatch.queue_waiting_head_age_ms",
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
    expect(vi.mocked(recordGauge).mock.calls).toHaveLength(6);
    expect(
      vi.mocked(recordGauge).mock.calls.every(([, value]) => value === 0),
    ).toBe(true);
  });

  it("awaits failed telemetry collections while preserving independent queue measurements", async () => {
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
        "langfuse.events_dispatch.queue_waiting_head_age_ms",
        0,
        { unit: "milliseconds" },
      ),
    );
    expect(completed).toBe(false);
    pendingMemory.reject(new Error("memory unavailable"));
    await collection;
    // Only queue age succeeds; failed memory samples emit no zeros.
    expect(vi.mocked(recordGauge).mock.calls).toHaveLength(1);
  });

  it("dispatches with locality selection and records bounded selector measurements", async () => {
    const minute = 60_000;
    await recordActivity("project-a", [
      matched("short-1", T0 + 10 * minute),
      matched("short-1", T0 + 12 * minute),
      matched("wide", T0 + 0),
      matched("wide", T0 + 8 * 60 * minute),
    ]);
    await recordActivity("project-b", [
      matched("short-2", T0 + 11 * minute),
      matched("short-2", T0 + 13 * minute),
    ]);
    const due = Date.now() - 1_000;
    await client().zadd(
      recordingKeys.due,
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
      "langfuse.trace_dispatch.candidate_buffer_size",
      3,
    );
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.events_dispatch.event_time_envelope_ms",
      29_040_000,
    );
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.events_dispatch.dispatched_batches",
      1,
      { fill: "partial" },
    );
    expect(
      vi
        .mocked(recordDistribution)
        .mock.calls.some(
          ([name, value, tags]) =>
            name === "langfuse.trace_dispatch.selector_duration_ms" &&
            Number(value) >= 0 &&
            tags === undefined,
        ),
    ).toBe(true);
  });

  it("excludes oversized and too-old traces from dispatch, removes their state, and reports their IDs", async () => {
    eventsDispatchConfig.maxTraceBytes = 1_000;
    const warn = vi.spyOn(shared.logger, "warn");
    await recordActivity("project", [
      matched("large-input", T0 + 1_000_000, 5_000),
      matched("small", T0 + 1_000_000),
      // One span with an SDK start time of 0 pins the trace's earliest start to 1970.
      matched("epoch", 0),
      matched("epoch", T0 + 1_000_000),
    ]);
    await makeDue("project", "large-input", "small", "epoch");

    await runner().processBatch();

    const jobs = await queue.getJobs(["wait"]);
    expect(
      jobs.map((job) => job.data.payload.traces.map(({ traceId }) => traceId)),
    ).toEqual([["small"]]);
    expect(await client().zcard(recordingKeys.due)).toBe(0);
    expect(await client().hlen(recordingKeys.pending)).toBe(0);
    for (const [traceId, reason] of [
      ["large-input", "serialized_bytes"],
      ["epoch", "start_too_old"],
    ] as const) {
      expect(recordIncrement).toHaveBeenCalledWith(
        "langfuse.trace_dispatch.excluded_traces",
        1,
        { reason },
      );
      expect(warn).toHaveBeenCalledWith(
        "Trace batch excluded trace",
        expect.objectContaining({ projectId: "project", traceId, reason }),
      );
    }
    // Retained bounds judge later activity on the whole trace.
    await recordActivity("project", [matched("large-input", T0 + 1_000_001)]);
    expect(
      (await readRecordedBounds(member("project", "large-input"))).value
        .serializedEventBytes,
    ).toBe(5_100);
    await makeDue("project", "large-input");
    await runner().processBatch();
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().zcard(recordingKeys.due)).toBe(0);
    expect(await client().hlen(recordingKeys.pending)).toBe(0);
  });

  it("does not report an oversized trace as excluded when new activity keeps it pending", async () => {
    eventsDispatchConfig.maxTraceBytes = 1_000;
    const warn = vi.spyOn(shared.logger, "warn");
    await recordActivity("project", [
      matched("reactivated", T0 + 1_000_000, 5_000),
    ]);
    await makeDue("project", "reactivated");
    const acknowledgeSha = createHash("sha1")
      .update(ACKNOWLEDGE_RECORDING_SCRIPT)
      .digest("hex");
    const evaluate = client().evalsha.bind(client());
    let reactivated = false;
    vi.spyOn(client(), "evalsha").mockImplementation((async (
      scriptHash: string,
      keyCount: number,
      ...args: (string | number | Buffer)[]
    ) => {
      if (!reactivated && scriptHash === acknowledgeSha) {
        reactivated = true;
        await recordActivity("project", [
          { ...spanActivity("reactivated", T0 + 1_000_001), ruleIds: [] },
        ]);
      }
      return evaluate(scriptHash, keyCount, ...args);
    }) as typeof evaluate);

    await runner().processBatch();

    expect(reactivated).toBe(true);
    expect(
      await client().hexists(
        recordingKeys.pending,
        member("project", "reactivated"),
      ),
    ).toBe(1);
    expect(recordIncrement).not.toHaveBeenCalledWith(
      "langfuse.trace_dispatch.excluded_traces",
      expect.anything(),
      expect.anything(),
    );
    expect(warn).not.toHaveBeenCalledWith(
      "Trace batch excluded trace",
      expect.anything(),
    );
    expect(recordIncrement).not.toHaveBeenCalledWith(
      "langfuse.trace_dispatch.reactivated_traces",
      1,
    );
  });

  it("caches the project's settings in Redis with an expiry and replaces them on save", async () => {
    const orgId = `org-${randomUUID()}`;
    const projectId = `project-${randomUUID()}`;
    const cacheKey = `langfuse:tracing-readiness-settings:${projectId}`;
    await prisma.organization.create({
      data: { id: orgId, name: "Idle time cache org" },
    });
    await prisma.project.create({
      data: { id: projectId, orgId, name: "Idle time cache project" },
    });
    try {
      await recordActivity(projectId, [matched("uncached")]);
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
      await recordActivity(projectId, [matched("saved")]);
      const offset =
        Number(
          await client().zscore(recordingKeys.due, member(projectId, "saved")),
        ) - Date.now();
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
    vi.mocked(shared.getTracingReadinessSettings).mockRejectedValueOnce(
      new Error("Postgres unavailable"),
    );

    await recordActivity(projectId, [matched("failed")]);

    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_dispatch.idle_time_read_failures",
      1,
    );
    const offset =
      Number(
        await client().zscore(recordingKeys.due, member(projectId, "failed")),
      ) - Date.now();
    expect(offset).toBeGreaterThan(590_000);
    expect(offset).toBeLessThan(610_000);
  });

  it("does not dispatch or sample metrics on self-hosted deployments even with trace dispatch enabled", async () => {
    await recordActivity("project", [matched("trace")]);
    await makeDue("project", "trace");
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    const evaluate = vi.spyOn(client(), "eval");
    const evaluateCached = vi.spyOn(client(), "evalsha");
    const lock = vi.spyOn(client(), "set");
    await runner()["execute"]();
    await new TraceBatchMetricsRunner()["execute"]();
    expect(evaluate).not.toHaveBeenCalled();
    expect(evaluateCached).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
    expect(await client().hlen(recordingKeys.pending)).toBe(1);
    expect(await queue.count()).toBe(0);
  });

  it("admits the larger of the Topics rule's rate and the experiment rate", async () => {
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
      env.LANGFUSE_EVENTS_DISPATCH_SAMPLING_RATE_EXPERIMENTAL = rate;
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
    env.LANGFUSE_EVENTS_DISPATCH_SAMPLING_RATE_EXPERIMENTAL = 0.5;
    vi.mocked(getTopicsProcessingSampling).mockResolvedValueOnce(0.25);
    expect(await resolveTraceBatchSamplingRate("project")).toBe(0.5);
    // A rule sampling above it admits the rule's share.
    env.LANGFUSE_EVENTS_DISPATCH_SAMPLING_RATE_EXPERIMENTAL = 0.1;
    vi.mocked(getTopicsProcessingSampling).mockResolvedValueOnce(0.25);
    expect(await resolveTraceBatchSamplingRate("project")).toBe(0.25);
    // An unreadable gate falls back to the Topics allowlist.
    vi.mocked(getTopicsProcessingSampling).mockRejectedValueOnce(
      new Error("postgres down"),
    );
    expect(await resolveTraceBatchSamplingRate("project")).toBe(1);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_dispatch.topics_gate_failures",
      1,
    );
    // Nothing is admitted without events dispatch.
    env.LANGFUSE_EVENTS_DISPATCH_ENABLED = "false";
    expect(await resolveTraceBatchSamplingRate("project")).toBe(0);
  });

  it.each([{ maxSize: 60 }, { maxSize: 80 }])(
    "dispatches every trace once in batches capped at $maxSize",
    async ({ maxSize }) => {
      env.LANGFUSE_EVENTS_DISPATCH_MAX_BATCH_SIZE = maxSize;
      const traces = Array.from(
        { length: 201 },
        (_, index) => `trace-${index}`,
      );
      await recordActivity(
        "project",
        traces.map((traceId, index) =>
          matched(traceId, T0 + 1_000_000, index + 1),
        ),
      );
      await recordActivity("project", [matched("trace-0", T0 + 1_000_000, 5)]);
      await recordActivity("other", [
        matched("trace-0", T0 + 1_000_000, 10_000),
      ]);
      await client().zadd(
        recordingKeys.due,
        ...traces.flatMap((traceId, index) => [
          Date.now() - 1_000 + index,
          member("project", traceId),
        ]),
      );
      await makeDue("other", "trace-0");
      const add = vi.spyOn(queue, "add");
      await runner().processBatch();
      const jobs = await queue.getJobs(["wait"]);
      for (const job of jobs) EventsDispatchEventSchema.parse(job.data);
      const sizes = jobs
        .map((job) => job.data.payload.traces.length)
        .sort((a, b) => a - b);
      expect(sizes.every((size) => size <= maxSize)).toBe(true);
      const projectCounts = jobs
        .map(
          (job) =>
            new Set(job.data.payload.traces.map((trace) => trace.projectId))
              .size,
        )
        .sort((a, b) => a - b);
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
      expect(await client().zcard(recordingKeys.due)).toBe(0);
      expect(await client().hlen(recordingKeys.pending)).toBe(0);
      expect(
        vi
          .mocked(recordDistribution)
          .mock.calls.filter(
            ([name]) => name === "langfuse.events_dispatch.batch_size",
          )
          .map(([, value]) => value)
          .sort((a, b) => Number(a) - Number(b)),
      ).toEqual(sizes);
      expect(
        vi
          .mocked(recordDistribution)
          .mock.calls.filter(
            ([name]) => name === "langfuse.events_dispatch.batch_project_count",
          )
          .map(([, value]) => value)
          .sort((a, b) => Number(a) - Number(b)),
      ).toEqual(projectCounts);
      const expectedBytes = add.mock.calls.map(([, job]) =>
        job.payload.traces.reduce((total, trace) => {
          if (trace.projectId === "other") return total + 10_000;
          const index = Number(trace.traceId.replace("trace-", ""));
          return total + (index === 0 ? 6 : index + 1);
        }, 0),
      );
      expect(
        vi
          .mocked(recordDistribution)
          .mock.calls.filter(
            ([name, , tags]) =>
              name ===
                "langfuse.events_dispatch.estimated_serialized_event_bytes" &&
              tags?.scope === "batch",
          )
          .map(([, value, tags]) => ({ value, tags })),
      ).toEqual(
        expectedBytes.map((value) => ({
          value,
          tags: { scope: "batch" },
        })),
      );
      for (const [, job] of add.mock.calls) {
        for (const trace of job.payload.traces) {
          expect(Object.keys(trace).sort()).toEqual([
            "failedCount",
            "maxStart",
            "minStart",
            "projectId",
            "revision",
            "ruleIds",
            "serializedEventBytes",
            "traceId",
          ]);
        }
      }
      await runner().processBatch();
      expect(await queue.getWaitingCount()).toBe(sizes.length);
    },
  );

  it("dispatches the complete due cohort across hydration chunks", async () => {
    const due = Date.now() - 100_000;
    // Stays below the per-shard candidate limit so one run reads the whole cohort.
    const traces = Array.from({ length: 3_041 }, (_, i) => ({
      projectId: ["project-c", "project-a", "project-b"][i % 3],
      traceId: `trace-${String(i).padStart(5, "0")}`,
      due: due + Math.floor(i / 1_000) * 1_000,
    }));
    for (const projectId of ["project-c", "project-a", "project-b"]) {
      await recordActivity(
        projectId,
        traces
          .filter((trace) => trace.projectId === projectId)
          .map((trace) => matched(trace.traceId)),
      );
    }
    await client().zadd(
      recordingKeys.due,
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
        ([name]) => name === "langfuse.trace_dispatch.candidate_buffer_size",
      )
      .map(([, value]) => Number(value));
    expect(Math.max(...candidateSizes)).toBeLessThanOrEqual(1059);
    expect(batches.length).toBeGreaterThanOrEqual(
      Math.ceil(traces.length / 60),
    );
    expect(batches.length).toBeLessThanOrEqual(
      Math.ceil(traces.length / 1000) * Math.ceil(1000 / 60),
    );
    expect(await client().zcard(recordingKeys.due)).toBe(0);
    expect(await client().hlen(recordingKeys.pending)).toBe(0);
  });

  it("keeps project locality and a bounded partial tail across hydration chunks", async () => {
    const traces = Array.from({ length: 2_001 }, (_, index) => ({
      projectId: index % 2 === 0 ? "project-a" : "project-b",
      traceId: `trace-${String(index).padStart(4, "0")}`,
    }));
    for (const projectId of ["project-a", "project-b"]) {
      await recordActivity(
        projectId,
        traces
          .filter((trace) => trace.projectId === projectId)
          .map((trace) => matched(trace.traceId)),
      );
    }
    const due = Date.now() - 1_000;
    await client().zadd(
      recordingKeys.due,
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
          ([name]) => name === "langfuse.trace_dispatch.skipped_traces",
        )
        .map(([, value]) => value),
    ).toEqual([0, 0, 0]);
    expect(await queue.getWaitingCount()).toBe(batches.length);
    expect(await client().zcard(recordingKeys.due)).toBe(0);
    expect(await client().hlen(recordingKeys.pending)).toBe(0);
  });

  it("coalesces a non-final compatible partial across a hydration boundary", async () => {
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

    await recordActivity(
      "project",
      traces.map(({ traceId, start }) => matched(traceId, T0 + start)),
    );
    const due = Date.now() - 10_000;
    await client().zadd(
      recordingKeys.due,
      ...traces.flatMap(({ traceId }, index) => [
        due + index,
        member("project", traceId),
      ]),
    );
    const targetMember = member("project", early[0].traceId);
    const hydratedRevision = JSON.parse(
      (await client().hget(recordingKeys.pending, targetMember))!,
    ).revision;
    const hydrateSha = createHash("sha1")
      .update(HYDRATE_RECORDING_SCRIPT)
      .digest("hex");
    const evaluate = client().evalsha.bind(client());
    let reactivated = false;
    vi.spyOn(client(), "evalsha").mockImplementation(async (...args) => {
      const result = await evaluate(...args);
      if (!reactivated && args[0] === hydrateSha) {
        reactivated = true;
        await recordActivity("project", [
          { ...spanActivity(early[0].traceId, T0 + 11 * minute), ruleIds: [] },
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
        ([name]) => name === "langfuse.trace_dispatch.candidate_buffer_size",
      )
      .map(([, value]) => Number(value));
    expect(candidateBufferSizes).toContain(42);
    expect(Math.max(...candidateBufferSizes)).toBeLessThanOrEqual(1_059);
    const current = JSON.parse(
      (await client().hget(recordingKeys.pending, targetMember))!,
    );
    const dispatched = batches
      .flat()
      .find(({ traceId }) => traceId === early[0].traceId);
    expect(dispatched?.revision).toBe(hydratedRevision);
    expect(current.revision).not.toBe(hydratedRevision);
    expect((await readRecordedBounds(targetMember)).value.maxStart).toBe(
      T0 + 11 * minute,
    );
    expect(await client().zcard(recordingKeys.due)).toBe(1);
    expect(await client().hlen(recordingKeys.pending)).toBe(1);

    await makeDue("project", early[0].traceId);
    await runner().processBatch();
    expect(await queue.getWaitingCount()).toBe(batches.length + 1);
    expect(await client().zcard(recordingKeys.due)).toBe(0);
    expect(await client().hlen(recordingKeys.pending)).toBe(0);
  });

  it("cleans an expired backlog in bounded pages without queueing expired traces", async () => {
    traceDispatchConfig.pendingTtlMs = 60_000;
    const expired = Array.from({ length: 10_001 }, (_, i) =>
      matched(`expired-${i}`),
    );
    await recordActivity("project", [...expired, matched("ready")]);
    await client().zadd(
      recordingKeys.due,
      ...expired.flatMap(({ traceId }) => [
        Date.now() - 70_000,
        member("project", traceId),
      ]),
    );
    await makeDue("project", "ready");
    const dispatcher = runner();
    await dispatcher.processBatch();
    const dispatcherExpiries = vi
      .mocked(recordIncrement)
      .mock.calls.filter(
        ([name, , tags]) =>
          name === "langfuse.trace_dispatch.expired_traces" &&
          tags?.source === "dispatcher",
      )
      .map(([, count]) => count);
    expect(dispatcherExpiries.every((count) => count <= 1_000)).toBe(true);
    expect(dispatcherExpiries.reduce((sum, count) => sum + count, 0)).toBe(
      10_001,
    );
    const jobs = await queue.getJobs(["wait"]);
    expect(
      jobs.flatMap((job) =>
        job.data.payload.traces.map((trace) => trace.traceId),
      ),
    ).toEqual(["ready"]);
    expect(await client().hlen(recordingKeys.pending)).toBe(0);
    expect(await client().zcard(recordingKeys.due)).toBe(0);
  });

  it("acknowledges successful jobs when a later enqueue fails", async () => {
    env.LANGFUSE_EVENTS_DISPATCH_MAX_BATCH_SIZE = 1;
    await recordActivity("project", [matched("first"), matched("second")]);
    await makeDue("project", "first", "second");
    const add = queue.add.bind(queue);
    vi.spyOn(queue, "add")
      .mockImplementationOnce((...args) => add(...args))
      .mockRejectedValueOnce(new Error("enqueue unavailable"));
    const dispatcher = runner();
    await dispatcher.processBatch();
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().zcard(recordingKeys.due)).toBe(1);
    expect(await client().hlen(recordingKeys.pending)).toBe(1);
    await dispatcher.processBatch();
    expect(await queue.getWaitingCount()).toBe(2);
    expect(await client().zcard(recordingKeys.due)).toBe(0);
    expect(await client().hlen(recordingKeys.pending)).toBe(0);
  });

  it("reuses a queued batch when its acknowledgement fails", async () => {
    await recordActivity("project", [matched("trace")]);
    await makeDue("project", "trace");
    await recordActivity("other", [matched("trace")]);
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
    expect(await client().hlen(recordingKeys.pending)).toBe(2);
    await dispatcher.processBatch();
    expect(await queue.getWaitingCount()).toBe(1);
    expect(await client().hlen(recordingKeys.pending)).toBe(0);
    const [job] = await queue.getJobs(["wait"]);
    expect(
      job.data.payload.traces
        .map((trace) => member(trace.projectId, trace.traceId))
        .sort(),
    ).toEqual([member("other", "trace"), member("project", "trace")]);
  });

  it("subtracts dispatcher runtime from the next delay and catches up after an overrun", async () => {
    let clock = Date.now();
    const interval = traceDispatchConfig.dispatchIntervalMs;
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
    await recordActivity("project", [matched("trace")]);
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
    await recordActivity("project", [matched("next")]);
    await makeDue("project", "next");
    await dispatcher.processBatch();
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(await client().hlen(recordingKeys.pending)).toBe(1);
  });

  it("allows only one dispatcher and waits for its in-flight enqueue before shutdown", async () => {
    env.LANGFUSE_EVENTS_DISPATCH_MAX_BATCH_SIZE = 1;
    await recordActivity("project", [matched("trace")]);
    await makeDue("project", "trace");
    await recordActivity("other", [matched("trace")]);
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
    expect(await client().hlen(recordingKeys.pending)).toBe(1);
    await first.processBatch();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});
