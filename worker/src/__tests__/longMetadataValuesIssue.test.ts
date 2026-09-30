import { describe, expect, it } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  type EventRecordInsertType,
  LONG_METADATA_VALUE_THRESHOLD,
} from "@langfuse/shared/src/server";

import {
  findLongMetadataValues,
  LongMetadataValueTracker,
  MAX_KEYS_PER_ISSUE,
  type PendingLongMetadataValues,
  REPORT_WINDOW_MS,
  reportLongMetadataValues,
} from "../features/metadata-long-values";

const LIMIT = LONG_METADATA_VALUE_THRESHOLD;
const long = (extra = 1) => "x".repeat(LIMIT + extra);

const eventRecord = (
  projectId: string,
  metadata: Record<string, string>,
  spanId = "span",
) =>
  ({
    project_id: projectId,
    trace_id: `trace-${spanId}`,
    span_id: spanId,
    metadata_names: Object.keys(metadata),
    metadata_values: Object.values(metadata),
  }) as EventRecordInsertType;

const reported = (pending: PendingLongMetadataValues) => ({
  projectId: pending.projectId,
  keys: Object.fromEntries(pending.keys),
  exampleObservationId: pending.exampleObservationId,
});

describe("findLongMetadataValues", () => {
  it("counts characters, not UTF-16 units, and keeps the longest value per key", () => {
    const emoji = "😀".repeat(LIMIT); // 2 * LIMIT UTF-16 units, LIMIT characters
    const result = findLongMetadataValues(
      ["at_limit", "emoji_at_limit", "over", "over"],
      ["a".repeat(LIMIT), emoji, long(1), long(50)],
    );

    expect([...result]).toEqual([["over", LIMIT + 50]]);
  });
});

describe("LongMetadataValueTracker", () => {
  const createTracker = (
    report: (pending: PendingLongMetadataValues) => Promise<number | undefined>,
    clock = { now: 0 },
  ) =>
    new LongMetadataValueTracker(report, {
      autoFlush: false,
      now: () => clock.now,
    });

  it("reports each project once per window with the keys seen before the flush", async () => {
    const reports: ReturnType<typeof reported>[] = [];
    const clock = { now: 0 };
    const tracker = createTracker(async (pending) => {
      reports.push(reported(pending));
      return clock.now + REPORT_WINDOW_MS;
    }, clock);

    tracker.record(eventRecord("p1", { a: long(1), short: "ok" }, "first"));
    tracker.record(eventRecord("p1", { a: long(9), b: long(3) }, "second"));
    tracker.record(eventRecord("p2", { c: long(1) }, "other"));
    await tracker.flush();

    tracker.record(eventRecord("p1", { d: long(1) }));
    await tracker.flush();

    clock.now = REPORT_WINDOW_MS;
    tracker.record(eventRecord("p1", { e: long(1) }, "next-window"));
    await tracker.flush();

    expect(reports).toEqual([
      {
        projectId: "p1",
        keys: { a: LIMIT + 9, b: LIMIT + 3 },
        exampleObservationId: "first",
      },
      {
        projectId: "p2",
        keys: { c: LIMIT + 1 },
        exampleObservationId: "other",
      },
      {
        projectId: "p1",
        keys: { e: LIMIT + 1 },
        exampleObservationId: "next-window",
      },
    ]);
  });

  it("caps the keys listed in one issue", async () => {
    const reports: ReturnType<typeof reported>[] = [];
    const tracker = createTracker(async (pending) => {
      reports.push(reported(pending));
      return REPORT_WINDOW_MS;
    });

    tracker.record(
      eventRecord(
        "p1",
        Object.fromEntries(
          Array.from({ length: MAX_KEYS_PER_ISSUE + 5 }, (_, i) => [
            `key-${i}`,
            long(),
          ]),
        ),
      ),
    );
    await tracker.flush();

    expect(Object.keys(reports[0].keys)).toHaveLength(MAX_KEYS_PER_ISSUE);
  });

  it("retries a project on its next occurrence after a failed report", async () => {
    const attempts: string[] = [];
    let outcome: "throw" | "fail" | "ok" = "throw";
    const tracker = createTracker(async (pending) => {
      attempts.push(pending.exampleObservationId);
      if (outcome === "throw") throw new Error("db down");
      return outcome === "ok" ? REPORT_WINDOW_MS : undefined;
    });

    tracker.record(eventRecord("p1", { a: long() }, "1"));
    await expect(tracker.flush()).resolves.toBeUndefined();
    outcome = "fail";
    tracker.record(eventRecord("p1", { a: long() }, "2"));
    await tracker.flush();
    outcome = "ok";
    tracker.record(eventRecord("p1", { a: long() }, "3"));
    await tracker.flush();
    tracker.record(eventRecord("p1", { a: long() }, "4"));
    await tracker.flush();

    expect(attempts).toEqual(["1", "2", "3"]);
  });

  it("resumes when the window reported by another worker ends", async () => {
    const attempts: string[] = [];
    const clock = { now: 0 };
    const tracker = createTracker(async (pending) => {
      attempts.push(pending.exampleObservationId);
      return 1_000;
    }, clock);

    tracker.record(eventRecord("p1", { a: long() }, "1"));
    await tracker.flush();
    clock.now = 999;
    tracker.record(eventRecord("p1", { a: long() }, "2"));
    await tracker.flush();
    clock.now = 1_000;
    tracker.record(eventRecord("p1", { a: long() }, "3"));
    await tracker.flush();

    expect(attempts).toEqual(["1", "3"]);
  });
});

describe("reportLongMetadataValues", () => {
  const pending = (projectId: string): PendingLongMetadataValues => ({
    projectId,
    keys: new Map([
      ["retrieved_context", 800],
      ["prompt_snapshot", 600],
    ]),
    exampleTraceId: "trace-1",
    exampleObservationId: "obs-1",
  });

  it("creates one admin issue per project per window across workers", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const windowEnds = await Promise.all([
      reportLongMetadataValues(pending(projectId)),
      reportLongMetadataValues(pending(projectId)),
    ]);
    for (const windowEnd of windowEnds) {
      expect(windowEnd).toBeGreaterThan(Date.now());
    }

    const logs = await prisma.issueLog.findMany({ where: { projectId } });
    expect(logs).toEqual([
      expect.objectContaining({
        issueDefinitionId: "long-metadata-values",
        priority: 3,
        ctaLink: `/project/${projectId}/traces/trace-1?observation=obs-1`,
        description: expect.stringContaining(
          "`retrieved_context` (800), `prompt_snapshot` (600)",
        ),
      }),
    ]);
  });
});
