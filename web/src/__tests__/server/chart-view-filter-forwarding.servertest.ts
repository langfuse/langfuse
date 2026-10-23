import { randomUUID } from "crypto";
import { type FilterState } from "@langfuse/shared";
import { executeQuery } from "@langfuse/shared/query/server";
import { createEvent, createEventsCh } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { type ChartViewConfig } from "@/src/features/chart-view/types";
import { buildChartQuery } from "@/src/features/chart-view/lib/buildChartQuery";
import { toChartFilters } from "@/src/features/chart-view/lib/chartFilterCompatibility";

/**
 * The chart view narrows the table's filters with `toChartFilters` and hands
 * the rest to the v2 observations aggregate query. Which columns forward is a
 * hand-maintained policy list, so the two halves can drift apart silently: a
 * forwarded filter the query rejects breaks the whole chart, and a dropped
 * filter the query would have honoured makes the chart disagree with the table
 * it is supposed to visualise. These run the real query against ClickHouse to
 * pin that both directions hold for the shapes the events FilterState carries.
 *
 * v2 reads events_core/events_full, which only exist on a v4 deployment.
 */
const maybe =
  env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
    ? describe
    : describe.skip;

const CONFIG: ChartViewConfig = {
  metric: "count",
  aggregation: "count",
  breakdown: "none",
  chartType: "NUMBER",
  timeGranularity: "hour",
};

maybe("chart view filter forwarding", () => {
  const projectId = randomUUID();
  const startTime = new Date();
  const fromTimestamp = new Date(startTime.getTime() - 60 * 60 * 1000);
  const toTimestamp = new Date(startTime.getTime() + 60 * 60 * 1000);

  /** The chart's own path: narrow the table filters, then run the aggregate. */
  const chartCount = async (filterState: FilterState): Promise<number> => {
    const rows = await executeQuery(
      projectId,
      buildChartQuery({
        config: CONFIG,
        filters: toChartFilters(filterState),
        fromTimestamp,
        toTimestamp,
      }),
      "v2",
      true,
    );
    return Number(rows[0]?.count_count ?? 0);
  };

  beforeAll(async () => {
    await createEventsCh([
      createEvent({
        project_id: projectId,
        trace_id: randomUUID(),
        start_time: startTime,
        metadata_names: ["tier"],
        metadata_values: ["gold"],
        prompt_version: 3,
      }),
      createEvent({
        project_id: projectId,
        trace_id: randomUUID(),
        start_time: startTime,
        metadata_names: ["tier"],
        metadata_values: ["silver"],
        prompt_version: 7,
      }),
      createEvent({
        project_id: projectId,
        trace_id: randomUUID(),
        start_time: startTime,
        metadata_names: [],
        metadata_values: [],
        prompt_version: null,
      }),
    ]);
  });

  it("charts every event when nothing is filtered", async () => {
    await expect(chartCount([])).resolves.toBe(3);
  });

  it("applies a keyed metadata filter", async () => {
    await expect(
      chartCount([
        {
          column: "metadata",
          type: "stringObject",
          key: "tier",
          operator: "=",
          value: "gold",
        },
      ]),
    ).resolves.toBe(1);
  });

  it("requires the key to be present on a negated metadata match", async () => {
    // The event without a `tier` key is not a "tier does not contain gold"
    // match — the same semantic the table applies.
    await expect(
      chartCount([
        {
          column: "metadata",
          type: "stringObject",
          key: "tier",
          operator: "does not contain",
          value: "gold",
        },
      ]),
    ).resolves.toBe(1);
  });

  it("applies the numeric promptVersion filter", async () => {
    await expect(
      chartCount([
        { column: "promptVersion", type: "number", operator: ">=", value: 5 },
      ]),
    ).resolves.toBe(1);
  });

  it("drops the filters it cannot forward instead of erroring the query", async () => {
    await expect(
      chartCount([
        { column: "latency", type: "number", operator: ">", value: 0 },
        { column: "userId", type: "null", operator: "is not null", value: "" },
      ]),
    ).resolves.toBe(3);
  });
});
