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

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const THREE_DAYS_AGO = Date.now() - 72 * HOUR;

const toUtcDate = (clickhouseDateTime: string) =>
  new Date(`${clickhouseDateTime.replace(" ", "T")}Z`);

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

const countsInWindow = async (projectId: string, windowStart: Date) => {
  const rows = await getBillableUnitCountsByProjectInWindow({
    windowStart,
    projectId,
  });
  return Object.fromEntries(rows.map((row) => [row.eventType, row.count]));
};

/** Sums the billed units over every window the project has rows in. */
const billedUnitsAcrossWindows = async (projectId: string) => {
  const windows = await queryClickhouse<{ window: string }>({
    query: `
      SELECT DISTINCT toStartOfFifteenMinutes(ingested_at) AS window
      FROM billable_events
      WHERE project_id = {projectId: String}
    `,
    params: { projectId },
  });
  const totals: Partial<Record<BillableEventType, number>> = {};
  for (const { window } of windows) {
    const counts = await countsInWindow(projectId, toUtcDate(window));
    for (const [eventType, count] of Object.entries(counts)) {
      const type = eventType as BillableEventType;
      totals[type] = (totals[type] ?? 0) + count;
    }
  }
  return totals;
};

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
      { type: "observation", id: "span-1", bytes: 10 },
      { type: "observation", id: "span-2", bytes: 20 },
      { type: "score", id: "score-correction", bytes: expect.any(Number) },
      { type: "score", id: "score-numeric", bytes: expect.any(Number) },
      { type: "trace", id: traceId, bytes: 7 },
    ]);
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
    const billedBeforeDelete = await billedUnitsAcrossWindows(projectId);
    expect(billedBeforeDelete).toEqual({ observation: 2, trace: 1, score: 1 });

    await deleteEventsByTraceIds(projectId, [traceId]);
    await deleteScoresByTraceIds(projectId, [traceId]);

    const remainingEvents = await queryClickhouse<{ count: string }>({
      query: `SELECT count() AS count FROM events_full WHERE project_id = {projectId: String}`,
      params: { projectId },
    });
    expect(Number(remainingEvents[0].count)).toBe(0);
    expect(await billedUnitsAcrossWindows(projectId)).toEqual(
      billedBeforeDelete,
    );
  });
});

describe("getBillableUnitCountsByProjectInWindow", () => {
  // A fixed, 15-minute aligned window start; each test uses its own project.
  const T0 = new Date("2026-01-05T00:00:00.000Z");
  const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

  it("bills a re-sent unit again only after 24 hours without it", async (ctx) => {
    await skipUnlessBillableEvents(ctx);
    const projectId = randomUUID();
    await insertBillableEvents(projectId, [
      { eventType: "trace", eventId: "resent-within-24h", at: at(MINUTE) },
      { eventType: "trace", eventId: "resent-within-24h", at: at(24 * HOUR) },
      { eventType: "trace", eventId: "resent-after-24h", at: at(MINUTE) },
      {
        eventType: "trace",
        eventId: "resent-after-24h",
        at: at(24 * HOUR + 15 * MINUTE),
      },
    ]);

    expect(await countsInWindow(projectId, T0)).toEqual({ trace: 2 });
    // The lookback for this window starts at T0 and still sees both ids.
    expect(await countsInWindow(projectId, at(24 * HOUR))).toEqual({});
    // The lookback for this window starts after T0.
    expect(
      await countsInWindow(projectId, at(24 * HOUR + 15 * MINUTE)),
    ).toEqual({ trace: 1 });
  });

  it("bills a multi-day trace once while its gaps stay under 24 hours", async (ctx) => {
    await skipUnlessBillableEvents(ctx);
    const projectId = randomUUID();
    const windows = [0, 20 * HOUR, 40 * HOUR, 60 * HOUR].map(at);
    await insertBillableEvents(
      projectId,
      windows.map((windowStart) => ({
        eventType: "trace",
        eventId: "long-running-trace",
        at: windowStart,
      })),
    );

    const counts = await Promise.all(
      windows.map((windowStart) => countsInWindow(projectId, windowStart)),
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
      // Next window.
      { eventType: "score", eventId: "id-4", at: at(15 * MINUTE) },
    ]);
    // The same id in another project is a separate unit.
    await insertBillableEvents(projectB, [
      { eventType: "observation", eventId: "id-1", at: at(MINUTE) },
    ]);

    expect(await countsInWindow(projectA, T0)).toEqual({
      observation: 2,
      trace: 1,
      score: 1,
    });

    const allProjects = await getBillableUnitCountsByProjectInWindow({
      windowStart: T0,
    });
    expect(
      allProjects.filter((row) => row.projectId === projectA),
    ).toHaveLength(3);
    expect(allProjects.filter((row) => row.projectId === projectB)).toEqual([
      { projectId: projectB, eventType: "observation", count: 1 },
    ]);
  });

  it("rejects a window start that is not aligned to 15 minutes", async () => {
    await expect(
      getBillableUnitCountsByProjectInWindow({ windowStart: at(MINUTE) }),
    ).rejects.toThrow("aligned to 15 minutes");
  });
});
