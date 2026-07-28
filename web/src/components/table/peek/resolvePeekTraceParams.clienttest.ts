import { describe, expect, it } from "vitest";

import { resolvePeekTraceParams } from "@/src/components/table/peek/resolvePeekTraceParams";

// The two peek URL dialects (LFE-11041):
// - v3 TracesTable:  peek=<trace id>, timestamp=<trace timestamp>
// - v4 EventsTable:  peek=<observation id>, traceId=<trace id>,
//                    timestamp=<observation startTime>
// Each reader must accept the other dialect's URLs, since links cross the
// v4-beta boundary between users.

const TRACE_ID = "gist_service_8944222577377194128";
const OBSERVATION_ID = "2df44465-3d61-43b3-8f92-b9580395c8a1";
const TIMESTAMP = "2026-07-14T19:47:57.703Z";

describe("resolvePeekTraceParams", () => {
  describe("trace reader (v3 TracesTable peek)", () => {
    it("native v3 URL: uses peek as trace id and keeps the timestamp", () => {
      const result = resolvePeekTraceParams({
        reader: "trace",
        peek: TRACE_ID,
        timestamp: TIMESTAMP,
      });
      expect(result.traceId).toBe(TRACE_ID);
      expect(result.timestamp?.toISOString()).toBe(TIMESTAMP);
    });

    it("v4-generated URL: prefers the traceId param over peek", () => {
      const result = resolvePeekTraceParams({
        reader: "trace",
        peek: OBSERVATION_ID,
        traceId: TRACE_ID,
        timestamp: TIMESTAMP,
      });
      expect(result.traceId).toBe(TRACE_ID);
    });

    it("v4-generated URL: drops the timestamp (it is an observation startTime, not the trace timestamp)", () => {
      const result = resolvePeekTraceParams({
        reader: "trace",
        peek: OBSERVATION_ID,
        traceId: TRACE_ID,
        timestamp: TIMESTAMP,
      });
      expect(result.timestamp).toBeUndefined();
    });
  });

  describe("observation reader (v4 EventsTable peek)", () => {
    it("native v4 URL: uses the traceId param and keeps the timestamp", () => {
      const result = resolvePeekTraceParams({
        reader: "observation",
        peek: OBSERVATION_ID,
        traceId: TRACE_ID,
        timestamp: TIMESTAMP,
      });
      expect(result.traceId).toBe(TRACE_ID);
      expect(result.timestamp?.toISOString()).toBe(TIMESTAMP);
    });

    it("empty traceId param (v4 row without a trace): stays empty so the query remains disabled, no peek fallback", () => {
      // All v4 writers set traceId to "" when the row has no trace
      // (`row.traceId || ""`). Falling back to peek here would query an
      // observation id as a trace id inside a native v4 flow.
      const result = resolvePeekTraceParams({
        reader: "observation",
        peek: OBSERVATION_ID,
        traceId: "",
        timestamp: TIMESTAMP,
      });
      expect(result.traceId).toBe("");
    });

    it("v3-generated URL (no traceId param): falls back to peek as trace id, keeps the trace timestamp", () => {
      const result = resolvePeekTraceParams({
        reader: "observation",
        peek: TRACE_ID,
        timestamp: TIMESTAMP,
      });
      expect(result.traceId).toBe(TRACE_ID);
      expect(result.timestamp?.toISOString()).toBe(TIMESTAMP);
    });
  });

  it("decodes URL-encoded timestamps", () => {
    const result = resolvePeekTraceParams({
      reader: "trace",
      peek: TRACE_ID,
      timestamp: encodeURIComponent(TIMESTAMP),
    });
    expect(result.timestamp?.toISOString()).toBe(TIMESTAMP);
  });

  it("returns undefined trace id when neither param is present", () => {
    const result = resolvePeekTraceParams({ reader: "trace" });
    expect(result.traceId).toBeUndefined();
    expect(result.timestamp).toBeUndefined();
  });
});
