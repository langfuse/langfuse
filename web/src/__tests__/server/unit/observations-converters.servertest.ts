// Mock env before any @langfuse/shared module is loaded to prevent parse failures
// in environments without a .env file.
vi.mock("@langfuse/shared/src/env", () => ({
  env: new Proxy({} as Record<string, unknown>, { get: () => undefined }),
  removeEmptyEnvVariables: (e: Record<string, string | undefined>) => e,
}));

// Prisma client creation is a module-level side effect; stub it out.
vi.mock("@langfuse/shared/src/db", () => ({ prisma: {} }));

import {
  type EventsObservationRecordReadType,
  convertEventsObservation,
} from "@langfuse/shared/src/server/repositories/observations_converters";

const TRACE_CONTEXT_FIELDS = [
  "userId",
  "sessionId",
  "traceName",
  "release",
  "tags",
  "bookmarked",
  "public",
] as const;

/** Minimal complete record — all required ClickHouse columns present */
function makeRecord(
  overrides: Partial<EventsObservationRecordReadType> = {},
): EventsObservationRecordReadType {
  return {
    id: "obs-1",
    trace_id: "trace-1",
    project_id: "proj-1",
    type: "GENERATION",
    environment: "default",
    metadata: {},
    is_deleted: 0,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    start_time: "2024-01-01T00:00:00.000Z",
    event_ts: "2024-01-01T00:00:00.000Z",
    provided_usage_details: {},
    provided_cost_details: {},
    usage_details: {},
    cost_details: {},
    user_id: null,
    session_id: null,
    trace_name: null,
    release: null,
    tags: [],
    bookmarked: false,
    public: false,
    ...overrides,
  };
}

describe("convertEventsObservation", () => {
  describe("complete: false (V2 partial path)", () => {
    it("omits trace_context keys that are absent from the ClickHouse row", () => {
      const record: Partial<EventsObservationRecordReadType> = {
        id: "obs-1",
        trace_id: "trace-1",
        project_id: "proj-1",
        type: "GENERATION",
        start_time: "2024-01-01T00:00:00.000Z",
        // trace_context fields intentionally omitted — simulates a SELECT that
        // did not request the trace_context field group
      };

      const result = convertEventsObservation(record, undefined, false);

      for (const field of TRACE_CONTEXT_FIELDS) {
        expect(
          result,
          `key "${field}" must be absent when not in the ClickHouse row`,
        ).not.toHaveProperty(field);
      }
    });

    it("includes trace_context keys that are present in the row, even when null", () => {
      const record: Partial<EventsObservationRecordReadType> = {
        id: "obs-1",
        trace_id: "trace-1",
        project_id: "proj-1",
        type: "GENERATION",
        start_time: "2024-01-01T00:00:00.000Z",
        user_id: null,
        session_id: null,
        trace_name: null,
        release: null,
        tags: [],
        bookmarked: false,
        public: false,
      };

      const result = convertEventsObservation(record, undefined, false);

      expect(result).toHaveProperty("userId", null);
      expect(result).toHaveProperty("sessionId", null);
      expect(result).toHaveProperty("traceName", null);
      expect(result).toHaveProperty("release", null);
      expect(result).toHaveProperty("tags", []);
      expect(result).toHaveProperty("bookmarked", false);
      expect(result).toHaveProperty("public", false);
    });

    it("passes through non-null trace_context values unchanged", () => {
      const record: Partial<EventsObservationRecordReadType> = {
        id: "obs-1",
        trace_id: "trace-1",
        project_id: "proj-1",
        type: "GENERATION",
        start_time: "2024-01-01T00:00:00.000Z",
        user_id: "user-42",
        session_id: "session-99",
        trace_name: "my-trace",
        release: "v1.2.3",
        tags: ["alpha", "beta"],
        bookmarked: true,
        public: true,
      };

      const result = convertEventsObservation(record, undefined, false);

      expect(result).toHaveProperty("userId", "user-42");
      expect(result).toHaveProperty("sessionId", "session-99");
      expect(result).toHaveProperty("traceName", "my-trace");
      expect(result).toHaveProperty("release", "v1.2.3");
      expect(result).toHaveProperty("tags", ["alpha", "beta"]);
      expect(result).toHaveProperty("bookmarked", true);
      expect(result).toHaveProperty("public", true);
    });
  });

  describe("complete: true (V1 full path)", () => {
    it("always includes all trace_context keys even when their values are null", () => {
      const record = makeRecord({
        user_id: null,
        session_id: null,
        trace_name: null,
        release: null,
        tags: null,
      });

      const result = convertEventsObservation(record, undefined, true);

      expect(result).toHaveProperty("userId", null);
      expect(result).toHaveProperty("sessionId", null);
      expect(result).toHaveProperty("traceName", null);
      expect(result).toHaveProperty("release", null);
      expect(result).toHaveProperty("tags", null);
    });
  });
});
