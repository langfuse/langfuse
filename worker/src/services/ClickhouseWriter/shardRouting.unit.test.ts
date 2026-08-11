import { describe, expect, it } from "vitest";

import {
  cityHash64,
  cityHash64OfStrings,
  computeShardingKey,
  selectShardNum,
  type ShardInfo,
} from "@langfuse/shared/src/server";

/**
 * Ground-truth values captured from a real ClickHouse engine:
 *   clickhouse local --query "SELECT cityHash64(...)"
 * These pin our JS port to ClickHouse's frozen CityHash v1.0.2 semantics.
 */
describe("cityHash64 (ClickHouse v1.0.2 compatibility)", () => {
  it.each<[string, bigint]>([
    ["Moscow", 12507901496292878638n], // <=16
    ["abcdefghijklmnopqrst", 6597918609636401574n], // 17-32
    ["0123456789012345678901234567890123456789", 9147764089670627354n], // 33-64
    [
      "How can you write a big system without C++? -Paul Glick",
      10183671121863091144n,
    ], // 33-64
    [
      "the quick brown fox jumps over the lazy dog 0123456789 the quick brown fox again",
      11115680824280900120n,
    ], // >64
    ["proj", 14896595486816162932n],
    ["id-123", 9764350728603400031n],
  ])("cityHash64(%j)", (input, expected) => {
    expect(cityHash64(Buffer.from(input, "utf-8"))).toBe(expected);
  });

  it("matches ClickHouse multi-argument cityHash64('proj','id-123')", () => {
    expect(cityHash64OfStrings("proj", "id-123")).toBe(6126101850499802057n);
  });
});

describe("computeShardingKey", () => {
  it("traces uses cityHash64(project_id, id)", () => {
    const key = computeShardingKey("traces", { project_id: "proj", id: "t1" });
    expect(key).toBe(cityHash64OfStrings("proj", "t1"));
  });

  it("observations uses cityHash64(project_id, trace_id)", () => {
    const key = computeShardingKey("observations", {
      project_id: "proj",
      id: "o1",
      trace_id: "t1",
    });
    expect(key).toBe(cityHash64OfStrings("proj", "t1"));
  });

  it("scores uses cityHash64(project_id, ifNull(trace_id, id))", () => {
    const withTrace = computeShardingKey("scores", {
      project_id: "proj",
      id: "s1",
      trace_id: "t1",
    });
    expect(withTrace).toBe(cityHash64OfStrings("proj", "t1"));

    const withoutTrace = computeShardingKey("scores", {
      project_id: "proj",
      id: "s1",
      trace_id: null,
    });
    expect(withoutTrace).toBe(cityHash64OfStrings("proj", "s1"));

    // trace_id undefined (missing) also falls back to id, matching ifNull(NULL, id).
    const missingTrace = computeShardingKey("scores", {
      project_id: "proj",
      id: "s1",
    });
    expect(missingTrace).toBe(cityHash64OfStrings("proj", "s1"));

    // Non-null empty string is NOT null: ifNull("", id) === "", so hash the
    // empty string, NOT the id. This must not fall back to id.
    const emptyTrace = computeShardingKey("scores", {
      project_id: "proj",
      id: "s1",
      trace_id: "",
    });
    expect(emptyTrace).toBe(cityHash64OfStrings("proj", ""));
    expect(emptyTrace).not.toBe(cityHash64OfStrings("proj", "s1"));

    expect(
      computeShardingKey("scores", {
        project_id: "proj",
        id: "s1",
        trace_id: 123,
      }),
    ).toBeNull();
  });

  it("returns null when required key fields are missing", () => {
    expect(computeShardingKey("traces", { project_id: "proj" })).toBeNull();
    expect(
      computeShardingKey("observations", { project_id: "proj" }),
    ).toBeNull();
    expect(computeShardingKey("traces", { id: "t1" })).toBeNull();
  });
});

describe("selectShardNum", () => {
  const equalWeight: ShardInfo[] = [
    { shardNum: 1, weight: 1 },
    { shardNum: 2, weight: 1 },
    { shardNum: 3, weight: 1 },
  ];

  it("equal weights degenerate to (key % shardCount) + 1", () => {
    for (const key of [0n, 1n, 2n, 3n, 4n, 99n, 6126101850499802057n]) {
      const expectedShardNum = Number(key % 3n) + 1;
      expect(selectShardNum(key, equalWeight)).toBe(expectedShardNum);
    }
  });

  it("respects non-equal shard weights via cumulative ranges", () => {
    // shard1 weight 3 -> slots [0,3), shard2 weight 1 -> slot [3,4). total=4.
    const weighted: ShardInfo[] = [
      { shardNum: 1, weight: 3 },
      { shardNum: 2, weight: 1 },
    ];
    expect(selectShardNum(0n, weighted)).toBe(1); // slot 0
    expect(selectShardNum(1n, weighted)).toBe(1); // slot 1
    expect(selectShardNum(2n, weighted)).toBe(1); // slot 2
    expect(selectShardNum(3n, weighted)).toBe(2); // slot 3
    expect(selectShardNum(7n, weighted)).toBe(2); // 7 % 4 = 3 -> shard2
    expect(selectShardNum(4n, weighted)).toBe(1); // 4 % 4 = 0 -> shard1
  });

  it("handles a single shard", () => {
    expect(selectShardNum(123n, [{ shardNum: 1, weight: 1 }])).toBe(1);
  });

  it("returns null for empty topology", () => {
    expect(selectShardNum(123n, [])).toBeNull();
  });

  it("returns null for invalid shard weights", () => {
    expect(selectShardNum(123n, [{ shardNum: 1, weight: 0 }])).toBeNull();
    expect(selectShardNum(123n, [{ shardNum: 1, weight: 1.5 }])).toBeNull();
  });
});
