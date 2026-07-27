import { createEvent, createEventsCh } from "@langfuse/shared/src/server";
import { getEventMetricsTimeSeries } from "@/src/features/events/server/eventsService";
import { EventsMetricsTimeSeriesOptions } from "@/src/features/events/server/types";
import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";
import { type FilterCondition } from "@langfuse/shared";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const maybe =
  env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
    ? describe
    : describe.skip;

// The shared test project accumulates events across files; every test seeds
// events with a unique name and filters on it, which also exercises the
// filter-parity path the chart relies on.
const nameFilter = (name: string): FilterCondition => ({
  type: "string",
  column: "name",
  operator: "=",
  value: name,
});

// A fixed, minute-aligned base keeps epoch-aligned bucket assertions exact.
const BASE = new Date("2025-03-10T10:00:00.000Z");
const atMicros = (offsetSeconds: number) =>
  (BASE.getTime() + offsetSeconds * 1000) * 1000;

const range = (fromOffsetSeconds: number, toOffsetSeconds: number) => ({
  fromTimestamp: new Date(BASE.getTime() + fromOffsetSeconds * 1000),
  toTimestamp: new Date(BASE.getTime() + toOffsetSeconds * 1000),
});

describe("events metrics time series", () => {
  it("should kill redis connection", () => {
    // we need at least one test case to avoid hanging
    // redis connection when everything else is skipped.
  });

  maybe("getEventMetricsTimeSeries", () => {
    it("bins events into epoch-aligned buckets with per-bucket max aggregates", async () => {
      const name = `mts-bins-${randomUUID()}`;

      await createEventsCh([
        createEvent({
          project_id: projectId,
          name,
          start_time: atMicros(10),
          end_time: atMicros(12), // 2s latency
          cost_details: { total: 5 },
          usage_details: { total: 100 },
        }),
        createEvent({
          project_id: projectId,
          name,
          start_time: atMicros(40),
          end_time: atMicros(45), // 5s latency
          cost_details: { total: 9 },
          usage_details: { total: 50 },
        }),
        createEvent({
          project_id: projectId,
          name,
          start_time: atMicros(70),
          end_time: atMicros(77), // 7s latency
          cost_details: { total: 3 },
          usage_details: { total: 500 },
        }),
      ]);

      const { bins } = await getEventMetricsTimeSeries({
        projectId,
        filter: [nameFilter(name)],
        searchType: ["id"],
        ...range(0, 120),
        stepSeconds: 60,
      });

      expect(bins).toEqual([
        {
          bucketStart: BASE,
          count: 2,
          maxTotalCost: 9,
          maxLatencySeconds: 5,
          maxTotalTokens: 100,
        },
        {
          bucketStart: new Date(BASE.getTime() + 60_000),
          count: 1,
          maxTotalCost: 3,
          maxLatencySeconds: 7,
          maxTotalTokens: 500,
        },
      ]);
    });

    it("returns NULL (not 0) for buckets without cost/usage/end_time data", async () => {
      const name = `mts-nulls-${randomUUID()}`;

      await createEventsCh([
        createEvent({
          project_id: projectId,
          name,
          start_time: atMicros(10),
          end_time: null, // in-flight: no latency
          cost_details: {}, // no cost recorded
          usage_details: {}, // no usage recorded
        }),
      ]);

      const { bins } = await getEventMetricsTimeSeries({
        projectId,
        filter: [nameFilter(name)],
        searchType: ["id"],
        ...range(0, 60),
        stepSeconds: 60,
      });

      expect(bins).toEqual([
        {
          bucketStart: BASE,
          count: 1,
          maxTotalCost: null,
          maxLatencySeconds: null,
          maxTotalTokens: null,
        },
      ]);
    });

    it("silently ignores isRootObservation filters so non-root cost stays visible", async () => {
      const name = `mts-root-${randomUUID()}`;
      const traceId = randomUUID();

      await createEventsCh([
        createEvent({
          project_id: projectId,
          trace_id: traceId,
          name,
          parent_span_id: null, // root
          start_time: atMicros(10),
          end_time: atMicros(11),
          cost_details: {},
          usage_details: {},
        }),
        createEvent({
          project_id: projectId,
          trace_id: traceId,
          name,
          parent_span_id: randomUUID(), // non-root generation carrying the cost
          start_time: atMicros(20),
          end_time: atMicros(21),
          cost_details: { total: 42 },
          usage_details: { total: 4200 },
        }),
      ]);

      const { bins } = await getEventMetricsTimeSeries({
        projectId,
        filter: [
          nameFilter(name),
          {
            type: "boolean",
            column: "isRootObservation",
            operator: "=",
            value: true,
          },
        ],
        searchType: ["id"],
        ...range(0, 60),
        stepSeconds: 60,
      });

      expect(bins).toHaveLength(1);
      expect(bins[0].count).toBe(2); // root filter dropped: both events counted
      expect(bins[0].maxTotalCost).toBe(42);
      expect(bins[0].maxTotalTokens).toBe(4200);
    });

    it("treats explicit from/to as authoritative over startTime filters in the filter state", async () => {
      const name = `mts-bounds-${randomUUID()}`;

      await createEventsCh([
        createEvent({
          project_id: projectId,
          name,
          start_time: atMicros(10),
          end_time: atMicros(11),
        }),
        createEvent({
          project_id: projectId,
          name,
          start_time: atMicros(200), // outside the queried range
          end_time: atMicros(201),
        }),
      ]);

      const { bins } = await getEventMetricsTimeSeries({
        projectId,
        filter: [
          nameFilter(name),
          // Would exclude everything if it were applied.
          {
            type: "datetime",
            column: "startTime",
            operator: ">=",
            value: new Date("2030-01-01T00:00:00.000Z"),
          },
        ],
        searchType: ["id"],
        ...range(0, 60),
        stepSeconds: 60,
      });

      expect(bins).toHaveLength(1);
      expect(bins[0].count).toBe(1); // in-range event only
    });

    it("applies regular table filters and full-text search to the aggregates", async () => {
      const scopeUser = `mts-user-${randomUUID()}`;
      const needle = `needle${randomUUID().replaceAll("-", "")}`;
      const needleName = `mts-${needle}`;
      const otherName = `mts-other-${randomUUID()}`;

      await createEventsCh([
        createEvent({
          project_id: projectId,
          name: needleName,
          user_id: scopeUser,
          start_time: atMicros(10),
          end_time: atMicros(11),
        }),
        createEvent({
          project_id: projectId,
          name: otherName,
          user_id: scopeUser,
          start_time: atMicros(20),
          end_time: atMicros(21),
        }),
      ]);

      // Filter parity: user_id scopes to both, name filter narrows to one.
      const filtered = await getEventMetricsTimeSeries({
        projectId,
        filter: [
          nameFilter(needleName),
          {
            type: "string",
            column: "userId",
            operator: "=",
            value: scopeUser,
          },
        ],
        searchType: ["id"],
        ...range(0, 60),
        stepSeconds: 60,
      });
      expect(filtered.bins).toHaveLength(1);
      expect(filtered.bins[0].count).toBe(1);

      // Search parity: the id/name search narrows the same way the table does
      // (the needle appears only in the first event's name).
      const searched = await getEventMetricsTimeSeries({
        projectId,
        filter: [
          {
            type: "string",
            column: "userId",
            operator: "=",
            value: scopeUser,
          },
        ],
        searchQuery: needle,
        searchType: ["id"],
        ...range(0, 60),
        stepSeconds: 60,
      });
      expect(searched.bins).toHaveLength(1);
      expect(searched.bins[0].count).toBe(1);
    });
  });

  describe("EventsMetricsTimeSeriesOptions validation", () => {
    const base = {
      projectId,
      filter: [],
      searchQuery: null,
      searchType: ["id" as const],
      fromTimestamp: new Date("2025-03-10T00:00:00.000Z"),
      toTimestamp: new Date("2025-03-11T00:00:00.000Z"),
    };

    it("accepts a step producing a bounded number of buckets", () => {
      expect(
        EventsMetricsTimeSeriesOptions.safeParse({ ...base, stepSeconds: 60 })
          .success,
      ).toBe(true);
    });

    it("rejects steps producing more buckets than the cap", () => {
      // 24h / 10s = 8640 buckets > 1500
      expect(
        EventsMetricsTimeSeriesOptions.safeParse({ ...base, stepSeconds: 10 })
          .success,
      ).toBe(false);
    });

    it("rejects non-positive and fractional steps", () => {
      expect(
        EventsMetricsTimeSeriesOptions.safeParse({ ...base, stepSeconds: 0 })
          .success,
      ).toBe(false);
      expect(
        EventsMetricsTimeSeriesOptions.safeParse({ ...base, stepSeconds: 1.5 })
          .success,
      ).toBe(false);
    });

    it("rejects an inverted time range", () => {
      expect(
        EventsMetricsTimeSeriesOptions.safeParse({
          ...base,
          fromTimestamp: base.toTimestamp,
          toTimestamp: base.fromTimestamp,
          stepSeconds: 60,
        }).success,
      ).toBe(false);
    });
  });
});
