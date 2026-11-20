import { describe, expect, it } from "vitest";
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
  getBillableUnitCountsByProjectAndBucket,
  getBillableUnitCountsByProjectInWindow,
  queryClickhouse,
} from "@langfuse/shared/src/server";
// import type { TopicSummary } from "@langfuse/shared/topics";
// import { writeTopicSummaries } from "@langfuse/shared/topics/server";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const THREE_DAYS_AGO = Date.now() - 72 * HOUR;

/** Ledger id of an observation: span ids are only unique within a trace. */
const observationEventId = (traceId: string, spanId: string) =>
  `${traceId.length}:${traceId}:${spanId}`;

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
  it("preserves the payload size through core truncation and billing", async () => {
    const projectId = randomUUID();
    const traceId = randomUUID();
    await createEventsCh([
      createEvent({
        project_id: projectId,
        trace_id: traceId,
        span_id: "server-sized",
        event_bytes: undefined,
        input: "🔥".repeat(500),
        output: "café".repeat(500),
        metadata_names: ["large"],
        metadata_values: ["x".repeat(500)],
      }),
    ]);
    const full = await queryClickhouse<{ bytes: string }>({
      query: `SELECT toString(event_bytes) AS bytes
        FROM events_full WHERE project_id = {projectId: String}`,
      params: { projectId },
    });
    expect(Number(full[0].bytes)).toBeGreaterThan(0);
    const core = await queryClickhouse<{
      bytes: string;
      input_chars: string;
      metadata_chars: string;
    }>({
      query: `SELECT toString(event_bytes) AS bytes, toString(lengthUTF8(input)) AS input_chars,
        toString(lengthUTF8(metadata_values[1])) AS metadata_chars
        FROM events_core WHERE project_id = {projectId: String}`,
      params: { projectId },
    });
    expect(core).toEqual([
      { bytes: full[0].bytes, input_chars: "200", metadata_chars: "200" },
    ]);
    const billable = await getBillableRows(projectId);
    expect(
      billable
        .filter((row) => row.event_type === "observation")
        .map((row) => String(row.event_bytes)),
    ).toEqual([full[0].bytes]);
  });

  it("records observations, one row per trace and every score type", async () => {
    const projectId = randomUUID();
    const traceId = randomUUID();
    // Sorts right after traceId, which keeps the expected row order fixed.
    const experimentTraceId = `${traceId}-experiment`;
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
        source: "ingestion-api-dual-write",
        event_bytes: 7,
      }),
      // The experiment backfill derives trace spans the same way.
      createEvent({
        project_id: projectId,
        trace_id: experimentTraceId,
        span_id: `t-${experimentTraceId}`,
        source: "ingestion-api-dual-write-experiments",
        event_bytes: 5,
      }),
      // Event propagation writes real observations with a dual-write source.
      createEvent({
        project_id: projectId,
        trace_id: traceId,
        span_id: "span-dual-write",
        source: "ingestion-api-dual-write",
        event_bytes: 30,
      }),
      // A client may choose a 't-' span id itself; outside dual-write it is
      // an observation.
      createEvent({
        project_id: projectId,
        trace_id: traceId,
        span_id: `t-${traceId}`,
        source: "otel",
        event_bytes: 40,
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
      {
        type: "observation",
        id: observationEventId(traceId, "span-dual-write"),
        bytes: 30,
      },
      {
        type: "observation",
        id: observationEventId(traceId, `t-${traceId}`),
        bytes: 40,
      },
      { type: "score", id: "score-correction", bytes: expect.any(Number) },
      { type: "score", id: "score-numeric", bytes: expect.any(Number) },
      { type: "trace", id: traceId, bytes: 7 },
      { type: "trace", id: experimentTraceId, bytes: 5 },
    ]);
  });

  it("bills a span id once per trace it appears in", async () => {
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

  it("keeps billed units when the trace is deleted", async () => {
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

  it("copies the environment of observations, traces and scores", async () => {
    const projectId = randomUUID();
    const traceId = randomUUID();

    await createEventsCh([
      createEvent({
        project_id: projectId,
        trace_id: traceId,
        environment: "production",
      }),
    ]);
    await createScoresCh([
      createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        environment: "staging",
      }),
    ]);

    const rows = await queryClickhouse<{
      event_type: BillableEventType;
      environment: string;
    }>({
      query: `SELECT event_type, environment FROM billable_events
              WHERE project_id = {projectId: String}
              ORDER BY event_type`,
      params: { projectId },
    });
    expect(rows).toEqual([
      { event_type: "observation", environment: "production" },
      { event_type: "score", environment: "staging" },
      { event_type: "trace", environment: "production" },
    ]);
  });

  // it("bills a Topics facet summary once per source and facet version", async () => {
  //   const projectId = randomUUID();
  //   const traceId = randomUUID();
  //   const summary: TopicSummary = {
  //     projectId,
  //     facetId: "facet",
  //     facetVersion: 1,
  //     traceId,
  //     sessionId: null,
  //     triggerType: "automatic",
  //     environment: "production",
  //     traceName: "trace",
  //     unitStartTime: new Date(Date.now() - HOUR).toISOString(),
  //     state: "complete",
  //     summary: "summary",
  //     embedding: [1, ...Array<number>(255).fill(0)],
  //     transcriptId: "transcript",
  //     transcriptVersion: "1",
  //     summaryModel: "test",
  //     embeddingModel: "test",
  //     providedUsageDetails: {},
  //     usageDetails: {},
  //     providedCostDetails: {},
  //     costDetails: {},
  //     processedAt: new Date().toISOString(),
  //     metadata: {},
  //   };

  //   await writeTopicSummaries([summary]);
  //   await writeTopicSummaries([
  //     // A duplicate write of the same summary
  //     { ...summary, processedAt: new Date(Date.now() + SECOND).toISOString() },
  //     // The trace joined a session after its first summary
  //     { ...summary, sessionId: "late-session" },
  //     { ...summary, facetVersion: 2 },
  //     { ...summary, traceId: null, sessionId: "session", traceName: "" },
  //     // A re-insert of an older summary is not new usage
  //     {
  //       ...summary,
  //       facetId: "backfilled",
  //       processedAt: new Date(THREE_DAYS_AGO).toISOString(),
  //     },
  //     // No model call happens for insufficient input, so it is not usage
  //     {
  //       ...summary,
  //       facetId: "insufficient",
  //       state: "insufficient_input",
  //       summary: "",
  //       embedding: [],
  //     },
  //   ]);

  //   expect(await billedUnitsAroundNow(projectId)).toEqual({
  //     topic_facet_summary: 3,
  //   });
  //   const ledgerRows = await queryClickhouse<{
  //     environment: string;
  //     event_bytes: string;
  //   }>({
  //     query: `SELECT DISTINCT environment, toString(event_bytes) AS event_bytes
  //             FROM billable_events
  //             WHERE project_id = {projectId: String}`,
  //     params: { projectId },
  //   });
  //   expect(ledgerRows).toEqual([
  //     { environment: "production", event_bytes: "0" },
  //   ]);
  // });
});

describe("getBillableUnitCountsByProjectInWindow", () => {
  // A fixed window start; each test uses its own project.
  const T0 = new Date("2026-01-05T00:00:00.000Z");
  const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

  it("deduplicates within the window and against the 24 hours before it", async () => {
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

  it("bills a multi-day trace once while its gaps stay under 24 hours", async () => {
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

  it("counts per project and event type", async () => {
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

describe("getBillableUnitCountsByProjectAndBucket", () => {
  const T0 = new Date("2026-01-05T00:00:00.000Z");
  const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

  it("counts each unit once in every bucket it appears in", async () => {
    const projectId = randomUUID();
    await insertBillableEvents(projectId, [
      { eventType: "trace", eventId: "before-range", at: at(-2 * HOUR) },
      { eventType: "trace", eventId: "twice-in-hour", at: at(10 * MINUTE) },
      { eventType: "trace", eventId: "twice-in-hour", at: at(50 * MINUTE) },
      { eventType: "trace", eventId: "across-hours", at: at(50 * MINUTE) },
      { eventType: "trace", eventId: "across-hours", at: at(70 * MINUTE) },
      { eventType: "trace", eventId: "next-day", at: at(70 * MINUTE) },
      { eventType: "trace", eventId: "next-day", at: at(26 * HOUR) },
      { eventType: "observation", eventId: "obs", at: at(5 * MINUTE) },
    ]);
    const bucketed = (granularity: "hour" | "day") =>
      getBillableUnitCountsByProjectAndBucket({
        projectIds: [projectId],
        from: T0,
        to: at(27 * HOUR),
        granularity,
      }).then((rows) =>
        rows
          .map((row) => ({
            bucket: row.bucket.toISOString(),
            eventType: row.eventType,
            count: row.count,
          }))
          .sort(
            (a, b) =>
              a.bucket.localeCompare(b.bucket) ||
              a.eventType.localeCompare(b.eventType),
          ),
      );

    expect(await bucketed("hour")).toEqual([
      { bucket: at(0).toISOString(), eventType: "observation", count: 1 },
      { bucket: at(0).toISOString(), eventType: "trace", count: 2 },
      { bucket: at(HOUR).toISOString(), eventType: "trace", count: 2 },
      { bucket: at(26 * HOUR).toISOString(), eventType: "trace", count: 1 },
    ]);
    expect(await bucketed("day")).toEqual([
      { bucket: at(0).toISOString(), eventType: "observation", count: 1 },
      { bucket: at(0).toISOString(), eventType: "trace", count: 3 },
      { bucket: at(24 * HOUR).toISOString(), eventType: "trace", count: 1 },
    ]);
  });
});
