/**
 * Live read-path gate for the 04 P3 GreptimeDB dashboard query engine (executeQuery).
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeDashboardQuerySmoke.ts
 *
 * Reads the seeded `p2smoke-trace` project and runs representative dashboard widgets through the
 * GreptimeDB engine, asserting result shapes + domain values (NOT ClickHouse parity): count over
 * time (gap-filled buckets), latency p95 (uddsketch), totalCost by name (two-level fan-out collapse),
 * totalTokens (known-key), scores numeric avg, cost-by-type dynamic key, and the experiment-dim throw.
 */
import { executeGreptimeQuery } from "@langfuse/shared/query/server";
import { closeGreptimeConnections } from "@langfuse/shared/src/server";
import { type QueryType } from "@langfuse/shared";

const PROJECT = "98692739-71ed-427a-bbda-440aa8b47fa5";
const FROM = "2026-01-01T00:00:00.000Z";
const TO = "2027-01-01T00:00:00.000Z";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const q = (over: Partial<QueryType> & Pick<QueryType, "view">): QueryType =>
  ({
    filters: [],
    fromTimestamp: FROM,
    toTimestamp: TO,
    orderBy: null,
    dimensions: [],
    metrics: [],
    timeDimension: null,
    ...over,
  }) as QueryType;

async function main() {
  // 1. count over time (single-level, gap-filled)
  const countOverTime = await executeGreptimeQuery(
    PROJECT,
    q({
      view: "observations",
      metrics: [{ measure: "count", aggregation: "count" }],
      timeDimension: { granularity: "month" },
    }),
  );
  check("count-over-time returns rows", countOverTime.length > 0);
  check(
    "count-over-time rows carry time_dimension + count_count",
    countOverTime.every((r) => "time_dimension" in r && "count_count" in r),
  );
  const totalCount = countOverTime.reduce(
    (a, r) => a + Number(r.count_count ?? 0),
    0,
  );
  check("count-over-time total > 0", totalCount > 0, totalCount);

  // 2. latency p95 (uddsketch)
  const p95 = await executeGreptimeQuery(
    PROJECT,
    q({
      view: "observations",
      metrics: [{ measure: "latency", aggregation: "p95" }],
    }),
  );
  check(
    "latency p95 returns a numeric value",
    p95.length === 1 && typeof p95[0].p95_latency === "number",
    p95[0],
  );

  // 3. totalCost by name (two-level fan-out collapse)
  const costByName = await executeGreptimeQuery(
    PROJECT,
    q({
      view: "traces",
      dimensions: [{ field: "name" }],
      metrics: [{ measure: "totalCost", aggregation: "sum" }],
      chartConfig: { type: "table", row_limit: 20 },
    }),
  );
  check("totalCost-by-name returns rows", costByName.length > 0);
  check(
    "totalCost-by-name rows carry name + sum_totalCost (numeric)",
    costByName.every((r) => "name" in r && typeof r.sum_totalCost === "number"),
  );
  const costSum = costByName.reduce(
    (a, r) => a + Number(r.sum_totalCost ?? 0),
    0,
  );
  check("totalCost-by-name sum > 0", costSum > 0, costSum);

  // 4. totalTokens (known-key)
  const tokens = await executeGreptimeQuery(
    PROJECT,
    q({
      view: "observations",
      metrics: [{ measure: "totalTokens", aggregation: "sum" }],
    }),
  );
  check(
    "totalTokens sum > 0",
    tokens.length === 1 && Number(tokens[0].sum_totalTokens) > 0,
    tokens[0],
  );

  // 5. scores numeric avg (dashboard-router shape)
  const scores = await executeGreptimeQuery(
    PROJECT,
    q({
      view: "scores-numeric",
      dimensions: [
        { field: "name" },
        { field: "source" },
        { field: "dataType" },
      ],
      metrics: [
        { measure: "count", aggregation: "count" },
        { measure: "value", aggregation: "avg" },
      ],
    }),
  );
  check(
    "scores-numeric returns grouped rows",
    scores.length > 0,
    scores.length,
  );
  check(
    "scores-numeric rows carry avg_value",
    scores.every((r) => "avg_value" in r),
  );

  // 6. cost-by-type dynamic key expansion
  const byType = await executeGreptimeQuery(
    PROJECT,
    q({
      view: "observations",
      dimensions: [{ field: "costType" }],
      metrics: [{ measure: "costByType", aggregation: "sum" }],
      timeDimension: { granularity: "month" },
    }),
  );
  check("cost-by-type returns rows", byType.length > 0, byType.length);
  check(
    "cost-by-type rows carry costType key + sum_costByType",
    byType.every((r) => "costType" in r && "sum_costByType" in r),
  );
  const distinctKeys = new Set(byType.map((r) => r.costType));
  check("cost-by-type surfaced at least one cost key", distinctKeys.size > 0, [
    ...distinctKeys,
  ]);

  // 7. experiment / datasetRunId dimensions are supported (P4): the executor builds valid SQL
  //    (experiment relation = DISTINCT dataset_run_items join; datasetRunId = direct scores column)
  //    that runs on openfuse without throwing.
  let expThrew = false;
  try {
    await executeGreptimeQuery(
      PROJECT,
      q({
        view: "scores-numeric",
        dimensions: [{ field: "experimentName" }],
        metrics: [{ measure: "count", aggregation: "count" }],
      }),
    );
  } catch (e) {
    expThrew = true;
    console.error(e);
  }
  check("experiment dimension executes (P4 supported)", !expThrew);

  let drThrew = false;
  try {
    await executeGreptimeQuery(
      PROJECT,
      q({
        view: "scores-numeric",
        dimensions: [{ field: "datasetRunId" }],
        metrics: [{ measure: "count", aggregation: "count" }],
      }),
    );
  } catch (e) {
    drThrew = true;
    console.error(e);
  }
  check("datasetRunId dimension executes (P4 supported)", !drThrew);

  // The real experiment chart shape: experimentName as BOTH entityDimension and filter (same
  // relation) — verify the builder emits valid SQL (one join) and the executor runs it.
  let expFilterThrew = false;
  try {
    await executeGreptimeQuery(
      PROJECT,
      q({
        view: "observations",
        entityDimension: { field: "experimentName" },
        filters: [
          {
            column: "experimentName",
            operator: "any of",
            value: ["any-experiment"],
            type: "stringOptions",
          },
        ],
        metrics: [{ measure: "totalCost", aggregation: "sum" }],
      }),
    );
  } catch (e) {
    expFilterThrew = true;
    console.error(e);
  }
  check(
    "experiment entityDimension + filter (chart shape) executes",
    !expFilterThrew,
  );

  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURE(S)`);
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(async () => {
    await closeGreptimeConnections();
    process.exit(failures === 0 ? 0 : 1);
  });
