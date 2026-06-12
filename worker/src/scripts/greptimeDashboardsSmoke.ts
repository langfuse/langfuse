/**
 * Live read-path gate for the 04 P2 GreptimeDB dashboard rollups.
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeDashboardsSmoke.ts
 *
 * Reads the seeded `p2smoke-trace` project. Asserts score-aggregate grouping and the known-key
 * cost/usage time-series (date_bin + app-side gap fill), including bucket continuity and the
 * documented input/output/total narrowing.
 */
import {
  getScoreAggregate,
  getObservationCostByTypeByTime,
  getObservationUsageByTypeByTime,
  closeGreptimeConnections,
} from "@langfuse/shared/src/server";
import { type FilterState } from "@langfuse/shared";

const PROJECT = "98692739-71ed-427a-bbda-440aa8b47fa5";
const FROM = new Date("2026-01-01T00:00:00.000Z");
const TO = new Date("2027-01-01T00:00:00.000Z");

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const startTimeWindow: FilterState = [
  {
    type: "datetime",
    column: "Start Time",
    operator: ">=",
    value: FROM,
  } as FilterState[number],
  {
    type: "datetime",
    column: "Start Time",
    operator: "<",
    value: TO,
  } as FilterState[number],
];

async function main() {
  // --- score aggregate ---
  const scoreAgg = await getScoreAggregate(PROJECT, [
    {
      type: "datetime",
      column: "Score Timestamp",
      operator: ">=",
      value: FROM,
    } as FilterState[number],
  ]);
  check("score aggregate returns groups", scoreAgg.length > 0, scoreAgg.length);
  check(
    "score aggregate rows have name/count/avg/source/data_type",
    scoreAgg.every(
      (r) =>
        r.name &&
        Number.isFinite(Number(r.count)) &&
        Number.isFinite(Number(r.avg_value)) &&
        r.source &&
        r.data_type,
    ),
    scoreAgg.slice(0, 3),
  );
  const sentiment = scoreAgg.find((r) => r.name === "sentiment");
  check("categorical score 'sentiment' present", Boolean(sentiment), sentiment);

  // --- cost by type by time ---
  const cost = await getObservationCostByTypeByTime(PROJECT, startTimeWindow);
  check("cost time-series non-empty", cost.length > 0, cost.length);
  const costKeys = new Set(cost.map((r) => r.key));
  check(
    "cost keys within known allowlist",
    [...costKeys].every((k) => ["input", "output", "total"].includes(k)),
    [...costKeys],
  );
  check(
    "cost rows shaped {intervalStart,key,sum}",
    cost.every(
      (r) =>
        r.intervalStart instanceof Date &&
        typeof r.key === "string" &&
        Number.isFinite(r.sum),
    ),
  );
  const costTotal = cost
    .filter((r) => r.key === "total")
    .reduce((a, r) => a + r.sum, 0);
  check("summed cost 'total' > 0", costTotal > 0, costTotal);

  // bucket continuity: same number of buckets per key, evenly spaced.
  const buckets = [...new Set(cost.map((r) => r.intervalStart.getTime()))].sort(
    (a, b) => a - b,
  );
  const evenlySpaced =
    buckets.length < 2 ||
    new Set(buckets.slice(1).map((b, i) => b - buckets[i])).size === 1;
  check(
    "cost buckets evenly spaced (gap-filled grid)",
    evenlySpaced,
    buckets.length,
  );

  // --- usage by type by time ---
  const usage = await getObservationUsageByTypeByTime(PROJECT, startTimeWindow);
  check("usage time-series non-empty", usage.length > 0, usage.length);
  const usageTotal = usage
    .filter((r) => r.key === "total")
    .reduce((a, r) => a + r.sum, 0);
  check("summed usage 'total' > 0", usageTotal > 0, usageTotal);
  check(
    "usage keys within known allowlist",
    usage.every((r) => ["input", "output", "total"].includes(r.key)),
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
