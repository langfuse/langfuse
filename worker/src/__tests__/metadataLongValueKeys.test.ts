import { describe, expect, it } from "vitest";
import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  type EventRecordInsertType,
} from "@langfuse/shared/src/server";

import {
  findLongMetadataValues,
  LongMetadataValueTracker,
  type LongMetadataValueKeyRow,
  MAX_KEYS_PER_PROJECT,
  METADATA_VALUE_LENGTH_LIMIT,
  persistLongMetadataValueKeys,
} from "../features/metadata-long-values";

const LIMIT = METADATA_VALUE_LENGTH_LIMIT;

const eventRecord = (
  projectId: string,
  metadata: Record<string, string>,
  spanId = v4(),
) =>
  ({
    project_id: projectId,
    trace_id: `trace-${spanId}`,
    span_id: spanId,
    metadata_names: Object.keys(metadata),
    metadata_values: Object.values(metadata),
  }) as EventRecordInsertType;

const row = (
  projectId: string,
  key: string,
  maxValueLength: number,
): LongMetadataValueKeyRow => ({
  projectId,
  key,
  maxValueLength,
  exampleTraceId: `trace-${key}-${maxValueLength}`,
  exampleObservationId: `obs-${key}-${maxValueLength}`,
});

describe("findLongMetadataValues", () => {
  it("counts code points like events_core truncation", () => {
    const emoji = "😀".repeat(LIMIT); // 2 * LIMIT UTF-16 units, LIMIT code points
    const result = findLongMetadataValues(
      ["at_limit", "emoji_at_limit", "over", "over"],
      ["a".repeat(LIMIT), emoji, "b".repeat(LIMIT + 1), "c".repeat(LIMIT + 50)],
    );

    expect([...result]).toEqual([["over", LIMIT + 50]]);
  });
});

describe("LongMetadataValueTracker", () => {
  const createTracker = (
    persist: (rows: LongMetadataValueKeyRow[]) => Promise<number>,
    clock = { now: 0 },
  ) =>
    new LongMetadataValueTracker(persist, {
      enabled: true,
      autoFlush: false,
      now: () => clock.now,
    });

  it("reports each pair once per TTL and keeps the longest value per flush", async () => {
    const batches: LongMetadataValueKeyRow[][] = [];
    const clock = { now: 0 };
    const tracker = createTracker(async (rows) => {
      batches.push(rows);
      return rows.length;
    }, clock);

    tracker.record(eventRecord("p1", { k: "x".repeat(LIMIT + 1) }));
    tracker.record(eventRecord("p1", { k: "x".repeat(LIMIT + 9) }, "longest"));
    await tracker.flush();

    tracker.record(eventRecord("p1", { k: "x".repeat(LIMIT + 20) }));
    await tracker.flush();

    clock.now = 60 * 60 * 1000;
    tracker.record(eventRecord("p1", { k: "x".repeat(LIMIT + 1) }));
    await tracker.flush();

    expect(batches).toEqual([
      [
        {
          projectId: "p1",
          key: "k",
          maxValueLength: LIMIT + 9,
          exampleTraceId: "trace-longest",
          exampleObservationId: "longest",
        },
      ],
      [expect.objectContaining({ key: "k", maxValueLength: LIMIT + 1 })],
    ]);
  });

  it("retries a pair on its next occurrence after a failed write", async () => {
    const batches: LongMetadataValueKeyRow[][] = [];
    let fail = true;
    const tracker = createTracker(async (rows) => {
      batches.push(rows);
      if (fail) throw new Error("db down");
      return rows.length;
    });

    tracker.record(eventRecord("p1", { k: "x".repeat(LIMIT + 1) }));
    await expect(tracker.flush()).resolves.toBeUndefined();
    fail = false;
    tracker.record(eventRecord("p1", { k: "x".repeat(LIMIT + 1) }));
    await tracker.flush();

    expect(batches.map((b) => b.map((r) => r.key))).toEqual([["k"], ["k"]]);
  });

  it("does not track keys too long to store", async () => {
    const batches: LongMetadataValueKeyRow[][] = [];
    const tracker = createTracker(async (rows) => {
      batches.push(rows);
      return rows.length;
    });
    const sharedPrefix = "p".repeat(500);

    tracker.record(
      eventRecord("p1", {
        [`${sharedPrefix}a`]: "x".repeat(LIMIT + 1),
        [`${sharedPrefix}b`]: "x".repeat(LIMIT + 1),
        short: "x".repeat(LIMIT + 1),
      }),
    );
    await tracker.flush();

    expect(batches.map((b) => b.map((r) => r.key))).toEqual([["short"]]);
  });
});

describe("persistLongMetadataValueKeys", () => {
  const stored = (projectId: string) =>
    prisma.metadataLongValueKey.findMany({
      where: { projectId },
      orderBy: { key: "asc" },
    });

  it("keeps the longest value and its example on conflict", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    await persistLongMetadataValueKeys([row(projectId, "k", 300)]);
    await persistLongMetadataValueKeys([row(projectId, "k", 250)]);
    await persistLongMetadataValueKeys([row(projectId, "k", 400)]);

    expect(await stored(projectId)).toEqual([
      expect.objectContaining({
        key: "k",
        maxValueLength: 400,
        exampleTraceId: "trace-k-400",
      }),
    ]);
  });

  it("stops adding keys at the per-project cap but refreshes existing ones", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await persistLongMetadataValueKeys(
      Array.from({ length: MAX_KEYS_PER_PROJECT }, (_, i) =>
        row(projectId, `key-${i}`, 201),
      ),
    );

    const written = await persistLongMetadataValueKeys([
      row(projectId, "key-0", 500),
      row(projectId, "new-key", 500),
    ]);

    expect(written).toBe(1);
    const keys = await stored(projectId);
    expect(keys).toHaveLength(MAX_KEYS_PER_PROJECT);
    expect(keys.find((k) => k.key === "key-0")?.maxValueLength).toBe(500);
  });

  it("skips rows for unknown projects without failing the batch", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const written = await persistLongMetadataValueKeys([
      row(v4(), "k", 300),
      row(projectId, "k", 300),
    ]);

    expect(written).toBe(1);
    expect(await stored(projectId)).toHaveLength(1);
  });
});
