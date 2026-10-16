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
  DEFAULT_RENDERING_PROPS,
} from "@langfuse/shared/src/server";
import {
  GetObservationsV1Query,
  GetObservationsV2Query,
  transformDbToApiObservation,
  transformDbToApiObservationV2,
} from "@/src/features/public-api/types/observations";
import {
  getProjectionFieldGroups,
  getProjectionFields,
  ObservationFieldsSchema,
  projectObservation,
} from "@/src/features/mcp/server/observations/schema";

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

      const result = convertEventsObservation(
        record,
        DEFAULT_RENDERING_PROPS,
        false,
      );

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

      const result = convertEventsObservation(
        record,
        DEFAULT_RENDERING_PROPS,
        false,
      );

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

      const result = convertEventsObservation(
        record,
        DEFAULT_RENDERING_PROPS,
        false,
      );

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
        // The V1 read path can surface a null tags column; the insert-oriented
        // type only allows string[], so keep the null fixture via a cast.
        tags: null as unknown as string[],
      });

      const result = convertEventsObservation(
        record,
        DEFAULT_RENDERING_PROPS,
        true,
      );

      expect(result).toHaveProperty("userId", null);
      expect(result).toHaveProperty("sessionId", null);
      expect(result).toHaveProperty("traceName", null);
      expect(result).toHaveProperty("release", null);
      expect(result).toHaveProperty("tags", null);
    });

    it("keeps missing cost as null and preserves an explicit zero", () => {
      const missing = convertEventsObservation(
        makeRecord({ cost_details: {} }),
        DEFAULT_RENDERING_PROPS,
        true,
      );
      expect(missing.totalCost).toBeNull();
      expect(missing.inputCost).toBeNull();
      expect(missing.outputCost).toBeNull();

      const explicitZero = convertEventsObservation(
        makeRecord({ cost_details: { total: 0, input: 0, output: 0 } }),
        DEFAULT_RENDERING_PROPS,
        true,
      );
      expect(explicitZero.totalCost).toBe(0);
      expect(explicitZero.inputCost).toBe(0);
      expect(explicitZero.outputCost).toBe(0);
    });
  });
});

describe("public observation status compatibility", () => {
  it("supports status in MCP defaults and explicit field projections", () => {
    expect(getProjectionFields(undefined)).toEqual(
      expect.arrayContaining(["level", "status"]),
    );
    const fields = getProjectionFields(
      ObservationFieldsSchema.parse(["id", "status"]),
    );
    expect(getProjectionFieldGroups(fields)).toEqual(["core", "basic"]);
    expect(projectObservation({ id: "obs-1", level: "ERROR" }, fields)).toEqual(
      {
        id: "obs-1",
        status: "ERROR",
      },
    );
  });

  it("returns both status and level when the v2 basic group is selected", () => {
    const observation = convertEventsObservation(
      makeRecord({ level: "WARNING" }),
      DEFAULT_RENDERING_PROPS,
      false,
    );

    expect(transformDbToApiObservationV2(observation)).toMatchObject({
      level: "WARNING",
      status: "WARNING",
    });
  });

  it.each(["core", "usage"])(
    "omits both status and level when only the v2 %s group is selected",
    (group) => {
      const record = makeRecord();
      delete record.level;
      if (group === "usage") record.usage_details = { total: 42 };
      const observation = convertEventsObservation(
        record,
        DEFAULT_RENDERING_PROPS,
        false,
      );
      const response = transformDbToApiObservationV2(observation);

      expect(response).not.toHaveProperty("status");
      expect(response).not.toHaveProperty("level");
      if (group === "usage") {
        expect(response).toHaveProperty("usageDetails", { total: 42 });
      }
    },
  );

  it.each(["DEBUG", "DEFAULT", "WARNING", "ERROR"])(
    "returns status alongside the legacy level for %s observations",
    (level) => {
      const observation = convertEventsObservation(
        makeRecord({ level }),
        DEFAULT_RENDERING_PROPS,
        true,
      );

      const response = transformDbToApiObservation({
        ...observation,
        inputPrice: null,
        outputPrice: null,
        totalPrice: null,
      });

      expect(response).toHaveProperty("level", level);
      expect(response).toHaveProperty("status", level);
    },
  );

  it.each([
    ["v1", GetObservationsV1Query],
    ["v2", GetObservationsV2Query],
  ])("accepts status and legacy level filters in %s", (_version, schema) => {
    expect(schema.parse({ status: "WARNING", level: "ERROR" })).toMatchObject({
      status: "WARNING",
      level: "ERROR",
    });
    expect(schema.safeParse({ status: "INVALID" }).success).toBe(false);
  });
});
