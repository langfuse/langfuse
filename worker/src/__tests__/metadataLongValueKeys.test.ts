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
    persist: (
      rows: LongMetadataValueKeyRow[],
    ) => Promise<LongMetadataValueKeyRow[]>,
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
      return rows;
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

  it("stops reporting new keys for a project the database rejected as full", async () => {
    const batches: LongMetadataValueKeyRow[][] = [];
    const tracker = createTracker(async (rows) => {
      batches.push(rows);
      return rows.filter((r) => r.projectId !== "full");
    });

    tracker.record(eventRecord("full", { a: "x".repeat(LIMIT + 1) }));
    await tracker.flush();
    tracker.record(eventRecord("full", { b: "x".repeat(LIMIT + 1) }));
    tracker.record(eventRecord("open", { b: "x".repeat(LIMIT + 1) }));
    await tracker.flush();

    expect(batches.map((b) => b.map((r) => `${r.projectId}:${r.key}`))).toEqual(
      [["full:a"], ["open:b"]],
    );
  });

  it("never throws into ingestion when persisting fails", async () => {
    const tracker = createTracker(async () => {
      throw new Error("db down");
    });
    tracker.record(eventRecord("p1", { k: "x".repeat(LIMIT + 1) }));
    await expect(tracker.flush()).resolves.toBeUndefined();
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

    expect(written.map((r) => r.key)).toEqual(["key-0"]);
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

    expect(written.map((r) => r.projectId)).toEqual([projectId]);
  });
});
