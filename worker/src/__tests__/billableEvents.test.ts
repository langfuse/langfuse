import { describe, expect, it, type TestContext } from "vitest";
import { randomUUID } from "crypto";
import {
  type BillableEventType,
  clickhouseClient,
  createEvent,
  createEventsCh,
  createScoresCh,
  createTraceScore,
  deleteEventsByTraceIds,
  deleteScoresByTraceIds,
  getBillableUnitCountsByProjectInRange,
  getBillableUnitCountsByProjectInWindow,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { skipUnlessClickhouseTablesExist } from "./helpers/clickhouseTables";

// billable_events and its MVs are created only by the ClickHouse dev-tables
// setup, which CI runs for the default deploy mode only.
const skipUnlessBillableEvents = (ctx: TestContext) =>
  skipUnlessClickhouseTablesExist(
    ctx,
    ["billable_events"],
    "billable_events is created by ch:dev-tables only",
  );

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const THREE_DAYS_AGO = Date.now() - 72 * HOUR;

/** Ledger id of an observation: span ids are only unique within a trace. */
const observationEventId = (traceId: string, spanId: string) =>
  `${traceId.length}:${traceId}${spanId}`;

const getBillableRows = (projectId: string) =>
  queryClickhouse<{
    event_type: BillableEventType;
    event_id: string;
    event_bytes: string;
  }>({
    query: `
      SELECT event_type, event_id, event_bytes
      FROM billable_events
      WHERE project_id = {projectId: String}
      ORDER BY event_type, event_id
    `,
    params: { projectId },
  });

const countsInWindow = async (
  projectId: string,
  windowFrom: Date,
  windowTo: Date,
) => {
  const rows = await getBillableUnitCountsByProjectInWindow({
    windowFrom,
    windowTo,
    projectId,
  });
  return Object.fromEntries(rows.map((row) => [row.eventType, row.count]));
};

/** Billed units of rows the MVs just wrote, whose ingested_at is now. */
const billedUnitsAroundNow = (projectId: string) =>
  countsInWindow(
    projectId,
    new Date(Date.now() - HOUR),
    new Date(Date.now() + HOUR),
  );

/** Inserts ledger rows directly, to place them in chosen ingestion windows. */
const insertBillableEvents = (
  projectId: string,
  rows: Array<{ eventType: BillableEventType; eventId: string; at: Date }>,
) =>
  clickhouseClient().insert({
    table: "billable_events",
    format: "JSONEachRow",
    values: rows.map((row) => ({
      ingested_at: row.at.toISOString().slice(0, 19).replace("T", " "),
      project_id: projectId,
      event_type: row.eventType,
      event_id: row.eventId,
      event_time: row.at.toISOString().replace("T", " ").replace("Z", ""),
      event_bytes: 0,
    })),
  });

describe("billable_events materialized views", () => {
  it("records observations, one row per trace and every score type", async (ctx) => {
    await skipUnlessBillableEvents(ctx);
    const projectId = randomUUID();
    const traceId = randomUUID();
    const backfilledTraceId = randomUUID();

    await createEventsCh([
      createEvent({
        project_id: projectId,
        trace_id: traceId,
        span_id: "span-1",
        event_bytes: 10,
      }),
      createEvent({
        project_id: projectId,
        trace_id: traceId,
        span_id: "span-2",
        event_bytes: 20,
      }),
      // Dual-write trace span: only counts as the trace.
      createEvent({
        project_id: projectId,
        trace_id: traceId,
        span_id: `t-${traceId}`,
        event_bytes: 7,
      }),
      // Tombstone: not usage.
      createEvent({
        project_id: projectId,
        trace_id: traceId,
        span_id: "span-deleted",
        is_deleted: 1,
      }),
    ]);
    // A backfill keeps the source created_at, so it is not new usage.
    await createEventsCh([
      createEvent({
        project_id: projectId,
        trace_id: backfilledTraceId,
        span_id: "span-backfilled",
        created_at: THREE_DAYS_AGO,
      }),
    ]);
    await createScoresCh([
      createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        id: "score-numeric",
        data_type: "NUMERIC",
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        id: "score-correction",
        data_type: "CORRECTION",
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        id: "score-backfilled",
        created_at: THREE_DAYS_AGO,
      }),
    ]);

    const rows = await getBillableRows(projectId);
    expect(
      rows.map((row) => ({
        type: row.event_type,
        id: row.event_id,
        bytes: Number(row.event_bytes),
      })),
    ).toEqual([
      {
        type: "observation",
        id: observationEventId(traceId, "span-1"),
        bytes: 10,
      },
      {
        type: "observation",
        id: observationEventId(traceId, "span-2"),
        bytes: 20,
      },
      { type: "score", id: "score-correction", bytes: expect.any(Number) },
      { type: "score", id: "score-numeric", bytes: expect.any(Number) },
      { type: "trace", id: traceId, bytes: 7 },
    ]);
  });

  it("bills a span id once per trace it appears in", async (ctx) => {
    await skipUnlessBillableEvents(ctx);
    const projectId = randomUUID();

    await createEventsCh([
      // Ingestion API clients choose observation ids and may reuse them.
      createEvent({
        project_id: projectId,
        trace_id: randomUUID(),
        span_id: "llm-call",
      }),
      createEvent({
        project_id: projectId,
        trace_id: randomUUID(),
        span_id: "llm-call",
      }),
      // Trace and span ids whose plain concatenation would collide.
      createEvent({ project_id: projectId, trace_id: "t:x", span_id: "s" }),
      createEvent({ project_id: projectId, trace_id: "t", span_id: "x:s" }),
    ]);

    expect(await billedUnitsAroundNow(projectId)).toEqual({
      observation: 4,
      trace: 4,
    });
  });

  it("keeps billed units when the trace is deleted", async (ctx) => {
    await skipUnlessBillableEvents(ctx);
    const projectId = randomUUID();
    const traceId = randomUUID();

    await createEventsCh([
      createEvent({ project_id: projectId, trace_id: traceId }),
      createEvent({ project_id: projectId, trace_id: traceId }),
    ]);
    await createScoresCh([
      createTraceScore({ project_id: projectId, trace_id: traceId }),
    ]);
    const billedBeforeDelete = await billedUnitsAroundNow(projectId);
    expect(billedBeforeDelete).toEqual({ observation: 2, trace: 1, score: 1 });

    await deleteEventsByTraceIds(projectId, [traceId]);
    await deleteScoresByTraceIds(projectId, [traceId]);

    const remainingEvents = await queryClickhouse<{ count: string }>({
      query: `SELECT count() AS count FROM events_full WHERE project_id = {projectId: String}`,
      params: { projectId },
    });
    expect(Number(remainingEvents[0].count)).toBe(0);
    expect(await billedUnitsAroundNow(projectId)).toEqual(billedBeforeDelete);
  });
});

describe("getBillableUnitCountsByProjectInWindow", () => {
  // A fixed window start; each test uses its own project.
  const T0 = new Date("2026-01-05T00:00:00.000Z");
  const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

  it("deduplicates within the window and against the 24 hours before it", async (ctx) => {
    await skipUnlessBillableEvents(ctx);
    const projectId = randomUUID();
    await insertBillableEvents(projectId, [
      { eventType: "trace", eventId: "twice-in-window", at: at(0) },
      { eventType: "trace", eventId: "twice-in-window", at: at(40 * MINUTE) },
      // The lookback starts exactly 24 hours before windowFrom.
      { eventType: "trace", eventId: "resent-within-24h", at: at(-24 * HOUR) },
      { eventType: "trace", eventId: "resent-within-24h", at: at(5 * MINUTE) },
      {
        eventType: "trace",
        eventId: "resent-after-24h",
        at: at(-24 * HOUR - SECOND),
      },
      { eventType: "trace", eventId: "resent-after-24h", at: at(5 * MINUTE) },
      // windowTo is exclusive, so this belongs to the next window.
      { eventType: "trace", eventId: "at-window-end", at: at(HOUR) },
    ]);

    expect(await countsInWindow(projectId, T0, at(HOUR))).toEqual({
      trace: 2,
    });
    expect(await countsInWindow(projectId, at(HOUR), at(2 * HOUR))).toEqual({
      trace: 1,
    });
  });

  it("bills a multi-day trace once while its gaps stay under 24 hours", async (ctx) => {
    await skipUnlessBillableEvents(ctx);
    const projectId = randomUUID();
    const windowStarts = [0, 20 * HOUR, 40 * HOUR, 60 * HOUR].map(at);
    await insertBillableEvents(
      projectId,
      windowStarts.map((windowFrom) => ({
        eventType: "trace",
        eventId: "long-running-trace",
        at: windowFrom,
      })),
    );

    const counts = await Promise.all(
      windowStarts.map((windowFrom) =>
        countsInWindow(
          projectId,
          windowFrom,
          new Date(windowFrom.getTime() + 15 * MINUTE),
        ),
      ),
    );
    expect(counts).toEqual([{ trace: 1 }, {}, {}, {}]);
  });

  it("counts per project and event type", async (ctx) => {
    await skipUnlessBillableEvents(ctx);
    const projectA = randomUUID();
    const projectB = randomUUID();
    await insertBillableEvents(projectA, [
      { eventType: "observation", eventId: "id-1", at: at(MINUTE) },
      { eventType: "observation", eventId: "id-1", at: at(2 * MINUTE) },
      { eventType: "observation", eventId: "id-2", at: at(14 * MINUTE) },
      { eventType: "trace", eventId: "id-1", at: at(MINUTE) },
      { eventType: "score", eventId: "id-3", at: at(MINUTE) },
    ]);
    // The same id in another project is a separate unit.
    await insertBillableEvents(projectB, [
      { eventType: "observation", eventId: "id-1", at: at(MINUTE) },
    ]);

    expect(await countsInWindow(projectA, T0, at(15 * MINUTE))).toEqual({
      observation: 2,
      trace: 1,
      score: 1,
    });

    const allProjects = await getBillableUnitCountsByProjectInWindow({
      windowFrom: T0,
      windowTo: at(15 * MINUTE),
    });
    expect(
      allProjects.filter((row) => row.projectId === projectA),
    ).toHaveLength(3);
    expect(allProjects.filter((row) => row.projectId === projectB)).toEqual([
      { projectId: projectB, eventType: "observation", count: 1 },
    ]);
  });

  it("rejects a window that does not end after it starts", async () => {
    await expect(
      getBillableUnitCountsByProjectInWindow({ windowFrom: T0, windowTo: T0 }),
    ).rejects.toThrow("must end after it starts");
  });
});

describe("getBillableUnitCountsByProjectInRange", () => {
  const T0 = new Date("2026-01-12T00:00:00.000Z");
  const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

  it("sums the 15-minute windows instead of counting one long window", async (ctx) => {
    await skipUnlessBillableEvents(ctx);
    const projectId = randomUUID();
    await insertBillableEvents(projectId, [
      { eventType: "trace", eventId: "in-two-windows", at: at(MINUTE) },
      { eventType: "trace", eventId: "in-two-windows", at: at(20 * MINUTE) },
      // 23h40m before T0: inside the first window's lookback, but not inside
      // the lookback of the third window (from 23h30m before T0), where it
      // appears again and is billed. One hour-long window would not bill it.
      {
        eventType: "trace",
        eventId: "outside-later-lookback",
        at: at(-24 * HOUR + 20 * MINUTE),
      },
      {
        eventType: "trace",
        eventId: "outside-later-lookback",
        at: at(30 * MINUTE),
      },
    ]);

    expect(
      await getBillableUnitCountsByProjectInRange({
        from: T0,
        to: at(HOUR),
        projectId,
      }),
    ).toEqual([{ projectId, eventType: "trace", count: 2 }]);
  });

  it("rejects a range off the 15-minute boundaries", async () => {
    await expect(
      getBillableUnitCountsByProjectInRange({
        from: at(5 * MINUTE),
        to: at(HOUR),
      }),
    ).rejects.toThrow("whole 15-minute windows");
  });
});
