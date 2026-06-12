import { describe, expect, it } from "vitest";

import { eventTypes } from "../ingestion/types";
import {
  ingestionEventToRawEvent,
  parseRawEventHistory,
  TOMBSTONE_EVENT_TYPE,
} from "./converters";
import type { RawEventRow } from "./rawEvents";

const PROJECT = "p1";

describe("ingestionEventToRawEvent", () => {
  it("maps a trace-create event to a raw_events row", () => {
    const ts = "2026-06-12T00:00:00.000Z";
    const row = ingestionEventToRawEvent(
      {
        id: "evt-1",
        type: eventTypes.TRACE_CREATE,
        timestamp: ts,
        body: { id: "trace-1", name: "t", timestamp: ts },
      } as never,
      PROJECT,
      1000,
    );
    expect(row).not.toBeNull();
    expect(row).toMatchObject({
      projectId: PROJECT,
      entityType: "trace",
      entityId: "trace-1",
      eventId: "evt-1",
      eventType: eventTypes.TRACE_CREATE,
      eventTs: new Date(ts).getTime(),
      ingestedAt: 1000,
    });
    expect(JSON.parse(row!.body).body.id).toBe("trace-1");
  });

  it("prefers startTime for observations and falls back to envelope timestamp", () => {
    const start = "2026-06-12T01:00:00.000Z";
    const row = ingestionEventToRawEvent(
      {
        id: "evt-2",
        type: eventTypes.GENERATION_CREATE,
        timestamp: "2026-06-12T02:00:00.000Z",
        body: { id: "obs-1", startTime: start },
      } as never,
      PROJECT,
      2000,
    );
    expect(row?.entityType).toBe("observation");
    expect(row?.eventTs).toBe(new Date(start).getTime());
  });

  it("returns null when the event has no entity id", () => {
    const row = ingestionEventToRawEvent(
      {
        id: "evt-3",
        type: eventTypes.SCORE_CREATE,
        timestamp: "2026-06-12T00:00:00.000Z",
        body: { name: "no-id" },
      } as never,
      PROJECT,
      3000,
    );
    expect(row).toBeNull();
  });
});

describe("parseRawEventHistory", () => {
  const mkRow = (
    eventId: string,
    ingestedAt: number,
    body: unknown,
  ): RawEventRow => ({
    ingested_at: new Date(ingestedAt),
    event_id: eventId,
    event_type: "trace-create",
    event_ts: null,
    body: JSON.stringify(body),
  });

  it("dedups by event_id keeping the first-ingested copy and parses bodies", () => {
    const rows = [
      mkRow("e1", 100, { id: "evt-a", body: { id: "t1", name: "first" } }),
      mkRow("e1", 200, {
        id: "evt-a",
        body: { id: "t1", name: "redelivered" },
      }),
      mkRow("e2", 300, { id: "evt-b", body: { id: "t1", name: "update" } }),
    ];
    const { events, minIngestedAtMs } = parseRawEventHistory(rows);
    expect(events).toHaveLength(2);
    // first-ingested copy of e1 wins
    expect((events[0] as { body: { name: string } }).body.name).toBe("first");
    expect((events[1] as { body: { name: string } }).body.name).toBe("update");
    expect(minIngestedAtMs).toBe(100);
  });

  it("returns now-ish min when there are no rows", () => {
    const before = Date.now();
    const { events, minIngestedAtMs } = parseRawEventHistory([]);
    expect(events).toHaveLength(0);
    expect(minIngestedAtMs).toBeGreaterThanOrEqual(before);
  });

  const tombstoneRow = (ingestedAt: number): RawEventRow => ({
    ingested_at: new Date(ingestedAt),
    event_id: `tombstone-${ingestedAt}`,
    event_type: TOMBSTONE_EVENT_TYPE,
    event_ts: new Date(ingestedAt),
    body: JSON.stringify({ id: "t1", deletedAt: ingestedAt }),
  });

  it("flags deleted when a tombstone is the latest row and strips it from events", () => {
    const res = parseRawEventHistory([
      mkRow("e1", 100, { id: "evt-a", body: { id: "t1", name: "create" } }),
      tombstoneRow(200),
    ]);
    expect(res.deleted).toBe(true);
    expect(res.events).toHaveLength(1); // tombstone is not a replayable event
  });

  it("does NOT flag deleted when a live event is ingested after the tombstone (re-create)", () => {
    const res = parseRawEventHistory([
      mkRow("e1", 100, { id: "evt-a", body: { id: "t1", name: "create" } }),
      tombstoneRow(200),
      mkRow("e2", 300, { id: "evt-b", body: { id: "t1", name: "recreated" } }),
    ]);
    expect(res.deleted).toBe(false);
    expect(res.events).toHaveLength(2);
  });

  it("is not deleted when there is no tombstone", () => {
    const res = parseRawEventHistory([
      mkRow("e1", 100, { id: "evt-a", body: { id: "t1" } }),
    ]);
    expect(res.deleted).toBe(false);
  });
});
