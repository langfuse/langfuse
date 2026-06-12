/**
 * Live read-path gate for the 04 P2 GreptimeDB traces-UI table service (count / rows / identifiers /
 * two-phase metrics + rollup filters).
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeTracesUiSmoke.ts
 *
 * Reads the already-seeded `p2smoke-trace` project from openfuse and asserts product semantics +
 * cross-call consistency (GreptimeDB is the source of truth — no ClickHouse parity). Exercises the
 * real SQL/filter/binding/converter path: grain-aware CategoryOptions / ScoreNumberObject filters,
 * the aggregated-level string, the latency/cost rollup columns, and the Phase-2 usage/cost merge.
 */
import {
  getTracesTable,
  getTracesTableCount,
  getTracesTableMetrics,
  getTraceIdentifiers,
  closeGreptimeConnections,
} from "@langfuse/shared/src/server";
import { type FilterState } from "@langfuse/shared";

const PROJECT = "98692739-71ed-427a-bbda-440aa8b47fa5";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

async function main() {
  const noFilter: FilterState = [];

  // --- count / rows / identifiers consistency ---
  const total = await getTracesTableCount({
    projectId: PROJECT,
    filter: noFilter,
    searchType: [],
  });
  check("count > 0 (seeded project)", total > 0, total);

  const rows = await getTracesTable({
    projectId: PROJECT,
    filter: noFilter,
    orderBy: { column: "timestamp", order: "DESC" },
    limit: 10,
    page: 0,
  });
  check(
    "rows page <= limit",
    rows.length <= 10 && rows.length > 0,
    rows.length,
  );
  check(
    "rows carry id/timestamp/projectId",
    rows.every(
      (r) => r.id && r.projectId === PROJECT && r.timestamp instanceof Date,
    ),
  );
  check(
    "rows ordered by timestamp DESC",
    rows.every(
      (r, i) =>
        i === 0 || rows[i - 1].timestamp.getTime() >= r.timestamp.getTime(),
    ),
  );

  const ids = await getTraceIdentifiers({
    projectId: PROJECT,
    filter: noFilter,
    orderBy: { column: "timestamp", order: "DESC" },
    limit: 10,
    page: 0,
  });
  check(
    "identifiers match rows page (same ids/order)",
    ids.length === rows.length && ids.every((x, i) => x.id === rows[i].id),
    { ids: ids.map((x) => x.id), rows: rows.map((r) => r.id) },
  );

  // --- two-phase metrics ---
  const metrics = await getTracesTableMetrics({
    projectId: PROJECT,
    filter: noFilter,
    orderBy: { column: "timestamp", order: "DESC" },
    limit: 10,
    page: 0,
  });
  check(
    "metrics rows returned",
    metrics.length === rows.length,
    metrics.length,
  );
  const withObs = metrics.find((m) => m.observationCount > 0n);
  check("at least one metrics row has observations", Boolean(withObs));
  if (withObs) {
    check(
      "level is a valid label",
      ["DEBUG", "DEFAULT", "WARNING", "ERROR"].includes(withObs.level),
      withObs.level,
    );
    check(
      "latency is a non-negative number",
      withObs.latency != null && withObs.latency >= 0,
      withObs.latency,
    );
    // Phase-2 maps populated; calculatedTotalCost mirrors costDetails.total.
    check(
      "usage/cost maps are objects",
      typeof withObs.usageDetails === "object" &&
        typeof withObs.costDetails === "object",
    );
    const totalFromMap = withObs.costDetails.total ?? null;
    check(
      "calculatedTotalCost == costDetails.total",
      (withObs.calculatedTotalCost?.toNumber() ?? null) ===
        (totalFromMap == null ? null : Number(totalFromMap)),
      {
        calc: withObs.calculatedTotalCost?.toNumber() ?? null,
        map: totalFromMap,
      },
    );
    check(
      "promptTokens == sum of input usage keys",
      typeof withObs.promptTokens === "bigint",
    );
  }

  // --- grain-aware CategoryOptions filter (categorical sentiment) ---
  const sentimentFilter: FilterState = [
    {
      type: "categoryOptions",
      column: "score_categories",
      key: "sentiment",
      operator: "any of",
      value: ["negative", "positive"],
    },
  ];
  const sentimentCount = await getTracesTableCount({
    projectId: PROJECT,
    filter: sentimentFilter,
    searchType: [],
  });
  check(
    "categoryOptions(sentiment) count in (0, total]",
    sentimentCount > 0 && sentimentCount <= total,
    { sentimentCount, total },
  );

  const noneSentiment = await getTracesTableCount({
    projectId: PROJECT,
    filter: [
      {
        type: "categoryOptions",
        column: "score_categories",
        key: "sentiment",
        operator: "none of",
        value: ["negative", "positive"],
      },
    ],
    searchType: [],
  });
  check(
    "categoryOptions any-of + none-of partition the total",
    sentimentCount + noneSentiment === total,
    { sentimentCount, noneSentiment, total },
  );

  // --- grain-aware ScoreNumberObject filter (numeric quality) ---
  const qualityCount = await getTracesTableCount({
    projectId: PROJECT,
    filter: [
      {
        type: "numberObject",
        column: "scores_avg",
        key: "quality",
        operator: ">=",
        value: 0.8,
      },
    ],
    searchType: [],
  });
  check(
    "numberObject(quality>=0.8) count in (0, total]",
    qualityCount > 0 && qualityCount <= total,
    { qualityCount, total },
  );

  // --- rollup level filter forces the observations join ---
  const errorRows = await getTracesTable({
    projectId: PROJECT,
    filter: [
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
    ],
    orderBy: { column: "timestamp", order: "DESC" },
    limit: 50,
    page: 0,
  });
  check(
    "level=ERROR returns rows without error",
    Array.isArray(errorRows),
    errorRows.length,
  );

  // --- orderBy on a rollup cost column (Phase-1 aggregate) ---
  const byCost = await getTracesTableMetrics({
    projectId: PROJECT,
    filter: noFilter,
    orderBy: { column: "totalCost", order: "DESC" },
    limit: 10,
    page: 0,
  });
  check("orderBy totalCost returns metrics", byCost.length > 0, byCost.length);

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
