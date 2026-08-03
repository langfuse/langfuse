import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetClusterTopologyCacheForTests,
  __setClusterTopologyForTests,
  computeShardingKey,
  selectShardNum,
  type ClusterTopology,
} from "@langfuse/shared/src/server";

import { ClickhouseWriter, TableName } from "../ClickhouseWriter";

const mocks = vi.hoisted(() => ({
  nodeInsert: vi.fn(),
  clientForUrl: vi.fn(),
}));

// Preserve real topology helpers (routing math + cache) while stubbing metrics
// and logger so the per-shard routing logic runs against real code.
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    // Explicit so vitest's mock export check sees the new binding (export *
    // re-exports are not always visible to the mock proxy via object spread).
    hasUnsafeInternalReplication: original.hasUnsafeInternalReplication,
    resolveClickhouseDeploymentMode: original.resolveClickhouseDeploymentMode,
    getClusterTopologyContractState: original.getClusterTopologyContractState,
    CLICKHOUSE_ROUTING_VERSION: original.CLICKHOUSE_ROUTING_VERSION,
    recordHistogram: vi.fn(),
    recordIncrement: vi.fn(),
    recordCount: vi.fn(),
    recordGauge: vi.fn(),
    clickhouseClientForUrl: mocks.clientForUrl,
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock("../../env", async (importOriginal) => {
  const original = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...original,
    env: {
      ...original.env,
      LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE: 100,
      LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS: 5000,
      LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS: 3,
      CLICKHOUSE_WRITE_LOCAL_ENABLED: "true",
      CLICKHOUSE_SHARDING_ENABLED: "true",
      CLICKHOUSE_CLUSTER_ENABLED: "true",
    },
  };
});

const PROJECT_ID = "test-project";

const node = (host: string) => ({
  host,
  port: 8123,
  protocol: "http" as const,
});

const topology = (shardCount: number): ClusterTopology => ({
  clusterName: "default",
  fetchedAt: Date.now(),
  fingerprint: `topology-${shardCount}`,
  shards: Array.from({ length: shardCount }, (_, i) => ({
    shardNum: i + 1,
    weight: 1,
    internalReplication: true,
    replicas: [node(`shard-${i + 1}`)],
  })),
});

const makeTrace = (id: string) =>
  ({
    id,
    project_id: PROJECT_ID,
    timestamp: "2026-01-01 00:00:00",
    event_ts: "2026-01-01 00:00:00",
    is_deleted: 0,
  }) as any;

const expectedShard = (id: string, topo: ClusterTopology): number => {
  const key = computeShardingKey("traces", { id, project_id: PROJECT_ID });
  return selectShardNum(
    key!,
    topo.shards.map((s) => ({ shardNum: s.shardNum, weight: s.weight })),
  )!;
};

describe("ClickhouseWriter per-shard local batching", () => {
  let writer: ClickhouseWriter;
  let writeToShardSpy: ReturnType<typeof vi.spyOn>;
  let writeToClickhouseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.nodeInsert.mockReset();
    mocks.clientForUrl.mockReset();
    mocks.clientForUrl.mockReturnValue({ insert: mocks.nodeInsert });
    __resetClusterTopologyCacheForTests();
    // No injected client -> localModeActive can be true.
    writer = ClickhouseWriter.getInstance();
    // Prevent any real network on flush/shutdown.
    writeToShardSpy = vi
      .spyOn(writer as any, "writeToShard")
      .mockResolvedValue(undefined);
    writeToClickhouseSpy = vi
      .spyOn(writer as any, "writeToClickhouse")
      .mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await writer.shutdown();
    (ClickhouseWriter as any).instance = null;
    (ClickhouseWriter as any).client = null;
    __resetClusterTopologyCacheForTests();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("routes records into per-shard queues by sharding key", () => {
    const topo = topology(2);
    __setClusterTopologyForTests(topo);

    const ids = Array.from({ length: 20 }, (_, i) => `trace-${i}`);
    ids.forEach((id) => writer.addToQueue(TableName.Traces, makeTrace(id)));

    const byShard = (writer as any).localQueue[TableName.Traces] as Map<
      string,
      {
        shard: { shardNum: number };
        items: { data: { id: string } }[];
      }
    >;
    expect(byShard).toBeDefined();

    // Every record landed in the shard its key selects, and nothing leaked to
    // the table queue.
    let total = 0;
    for (const { shard, items } of byShard.values()) {
      for (const item of items) {
        expect(expectedShard(item.data.id, topo)).toBe(shard.shardNum);
      }
      total += items.length;
    }
    expect(total).toBe(ids.length);
    expect((writer as any).queue[TableName.Traces]).toHaveLength(0);
  });

  it("falls back to the table queue when topology is cold", () => {
    // No topology set -> getCachedClusterTopology() returns null.
    writer.addToQueue(TableName.Traces, makeTrace("cold-1"));

    expect((writer as any).localQueue[TableName.Traces]).toBeUndefined();
    expect((writer as any).queue[TableName.Traces]).toHaveLength(1);
  });

  it("falls back to the table queue when internal_replication is unsafe", () => {
    // Multi-replica shard with internal_replication=false → under-replication
    // risk for single-replica local inserts; refuse the local path.
    __setClusterTopologyForTests({
      clusterName: "default",
      fetchedAt: Date.now(),
      fingerprint: "unsafe-topology",
      shards: [
        {
          shardNum: 1,
          weight: 1,
          internalReplication: false,
          replicas: [node("shard-1a"), node("shard-1b")],
        },
      ],
    });

    writer.addToQueue(TableName.Traces, makeTrace("unsafe-1"));

    expect((writer as any).localQueue[TableName.Traces]).toBeUndefined();
    expect((writer as any).queue[TableName.Traces]).toHaveLength(1);
  });

  it("falls back to the table queue for unroutable records (missing key)", () => {
    __setClusterTopologyForTests(topology(2));

    // Missing project_id -> computeShardingKey returns null.
    writer.addToQueue(TableName.Traces, { id: "no-project" } as any);

    const byShard = (writer as any).localQueue[TableName.Traces] as
      | Map<string, { items: unknown[] }>
      | undefined;
    const localCount = byShard
      ? Array.from(byShard.values()).reduce((a, q) => a + q.items.length, 0)
      : 0;
    expect(localCount).toBe(0);
    expect((writer as any).queue[TableName.Traces]).toHaveLength(1);
  });

  it("flushes only the shard that reaches batchSize", async () => {
    const topo = topology(2);
    __setClusterTopologyForTests(topo);
    const idsByShard = new Map<number, string[]>([
      [1, []],
      [2, []],
    ]);
    for (
      let index = 0;
      idsByShard.get(1)!.length < writer.batchSize ||
      idsByShard.get(2)!.length < writer.batchSize - 1;
      index++
    ) {
      const id = `full-${index}`;
      const shardNum = expectedShard(id, topo);
      const targetSize =
        shardNum === 1 ? writer.batchSize : writer.batchSize - 1;
      if (idsByShard.get(shardNum)!.length < targetSize) {
        idsByShard.get(shardNum)!.push(id);
      }
    }

    idsByShard
      .get(2)!
      .forEach((id) => writer.addToQueue(TableName.Traces, makeTrace(id)));
    idsByShard
      .get(1)!
      .forEach((id) => writer.addToQueue(TableName.Traces, makeTrace(id)));

    // Let the size-triggered flushShard promise resolve.
    await vi.advanceTimersByTimeAsync(0);

    expect(writeToShardSpy).toHaveBeenCalledTimes(1);
    const [table, shard, _startReplicaIndex, records] =
      writeToShardSpy.mock.calls[0];
    expect(table).toBe(TableName.Traces);
    expect(shard.shardNum).toBe(1);
    expect(records).toHaveLength(writer.batchSize);
    // Table-queue path must not be used for routable records.
    expect(writeToClickhouseSpy).not.toHaveBeenCalled();
    const shardQueues = Array.from(
      (writer as any).localQueue[TableName.Traces].values(),
    ) as { shard: { shardNum: number }; items: unknown[] }[];
    expect(
      shardQueues.find((queue) => queue.shard.shardNum === 1),
    ).toBeUndefined();
    expect(
      shardQueues.find((queue) => queue.shard.shardNum === 2)?.items,
    ).toHaveLength(writer.batchSize - 1);
  });

  it("flushes a shard queue when its byte limit is reached", async () => {
    __setClusterTopologyForTests(topology(2));
    (writer as any).maxBatchBytes = 1;

    writer.addToQueue(TableName.Traces, makeTrace("byte-limited"));
    await vi.advanceTimersByTimeAsync(0);

    expect(writeToShardSpy).toHaveBeenCalledTimes(1);
    expect(writeToShardSpy.mock.calls[0][3]).toHaveLength(1);
  });

  it("rejects new local records when global queue capacity is exhausted", () => {
    __setClusterTopologyForTests(topology(2));
    (writer as any).maxLocalQueueRows = 1;

    writer.addToQueue(TableName.Traces, makeTrace("capacity-1"));

    expect(() =>
      writer.addToQueue(TableName.Traces, makeTrace("capacity-2")),
    ).toThrow("ClickHouse direct-local queue capacity exceeded");
  });

  it("interval sweep flushes non-empty shard queues", async () => {
    __setClusterTopologyForTests(topology(2));

    writer.addToQueue(TableName.Traces, makeTrace("a"));
    writer.addToQueue(TableName.Traces, makeTrace("b"));

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(writeToShardSpy).toHaveBeenCalled();
    const flushed = writeToShardSpy.mock.calls.reduce(
      (sum, call) => sum + (call[3] as unknown[]).length,
      0,
    );
    expect(flushed).toBe(2);
  });

  it("requeues a failed shard batch with incremented attempts", async () => {
    __setClusterTopologyForTests(topology(1));

    // Non-retryable error -> backOff stops, catch block requeues to the SAME
    // shard queue with attempts+1.
    writeToShardSpy.mockRejectedValue(new Error("boom (non-retryable)"));

    writer.addToQueue(TableName.Traces, makeTrace("retry-1"));
    const queueKey = Array.from(
      (writer as any).localQueue[TableName.Traces].keys(),
    )[0] as string;
    await (writer as any).flushShard(TableName.Traces, queueKey);

    const shardQueue = (writer as any).localQueue[TableName.Traces].get(
      queueKey,
    ) as {
      items: { attempts: number; data: { id: string } }[];
    };
    expect(shardQueue.items).toHaveLength(1);
    expect(shardQueue.items[0].data.id).toBe("retry-1");
    expect(shardQueue.items[0].attempts).toBe(2);
  });

  it("fails over only when a replica definitely rejected the connection", async () => {
    const refused = Object.assign(new Error("connection refused"), {
      code: "ECONNREFUSED",
    });
    mocks.nodeInsert.mockRejectedValueOnce(refused).mockResolvedValueOnce({});
    const shard = {
      shardNum: 1,
      weight: 1,
      internalReplication: true,
      replicas: [node("replica-1"), node("replica-2")],
    };

    await (writer as any).insertIntoShard(shard, "traces_local", "traces", [
      makeTrace("failover"),
    ]);

    expect(mocks.nodeInsert).toHaveBeenCalledTimes(2);
    expect(mocks.nodeInsert.mock.calls[1][0].clickhouse_settings).toMatchObject(
      {
        async_insert: 0,
        insert_deduplicate: 1,
      },
    );
    expect(mocks.clientForUrl).toHaveBeenNthCalledWith(
      1,
      "http://replica-1:8123",
    );
    expect(mocks.clientForUrl).toHaveBeenNthCalledWith(
      2,
      "http://replica-2:8123",
    );
  });

  it("does not fail over after an ambiguous connection reset", async () => {
    const reset = Object.assign(new Error("connection reset"), {
      code: "ECONNRESET",
    });
    mocks.nodeInsert.mockRejectedValue(reset);
    const shard = {
      shardNum: 1,
      weight: 1,
      internalReplication: true,
      replicas: [node("replica-1"), node("replica-2")],
    };

    await expect(
      (writer as any).insertIntoShard(shard, "traces_local", "traces", [
        makeTrace("no-failover"),
      ]),
    ).rejects.toThrow("connection reset");
    expect(mocks.nodeInsert).toHaveBeenCalledTimes(1);
  });
});
