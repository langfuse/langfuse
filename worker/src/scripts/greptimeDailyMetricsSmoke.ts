/**
 * Smoke test for the GreptimeDB daily-metrics read path (04-read-path.md, P4).
 * Run from the worker package:
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeDailyMetricsSmoke.ts
 *
 * Seeds traces + observations across two days, then asserts generateDailyMetrics / getDailyMetricsCount:
 *   - per-day trace/observation counts and total cost,
 *   - app-side full-key usage expansion: a custom key `input_cached` is summed into inputUsage
 *     (faithful to CH `positionCaseInsensitive(key,'input')`), `total` is the exact-key sum.
 *
 * Idempotent: deletes its own fixture (project_id = SMOKE_PROJECT) before and after.
 */
import {
  greptimeQuery,
  closeGreptimeConnections,
  generateDailyMetrics,
  getDailyMetricsCount,
  FilterList,
  type ObservationRecordInsertType,
  type TraceRecordInsertType,
} from "@langfuse/shared/src/server";
import { GreptimeWriter, GreptimeTable } from "../services/GreptimeWriter";

const SMOKE_PROJECT = "smoke-daily-0001";
const D1 = Date.UTC(2026, 5, 1, 10, 0, 0);
const D2 = Date.UTC(2026, 5, 2, 10, 0, 0);

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined && !ok ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cleanup = async () => {
  for (const table of ["observations", "traces"]) {
    await greptimeQuery({
      query: `DELETE FROM \`${table}\` WHERE \`project_id\` = ?`,
      params: [SMOKE_PROJECT],
    });
  }
};

const trace = (id: string, ts: number): TraceRecordInsertType => ({
  id,
  project_id: SMOKE_PROJECT,
  timestamp: ts,
  name: "t",
  environment: "default",
  user_id: "u1",
  session_id: "s1",
  release: null,
  version: null,
  metadata: {},
  tags: [],
  public: false,
  bookmarked: false,
  input: "{}",
  output: "{}",
  created_at: ts,
  updated_at: ts,
  event_ts: ts,
  is_deleted: 0,
});

const observation = (
  id: string,
  traceId: string,
  ts: number,
  usage: Record<string, number>,
  cost: number,
): ObservationRecordInsertType => ({
  id,
  project_id: SMOKE_PROJECT,
  trace_id: traceId,
  type: "GENERATION",
  environment: "default",
  name: "gen",
  level: "DEFAULT",
  start_time: ts,
  end_time: ts + 1000,
  metadata: {},
  provided_model_name: "gpt-4o",
  internal_model_id: "m1",
  model_parameters: "{}",
  provided_usage_details: usage,
  usage_details: usage,
  provided_cost_details: {},
  cost_details: { total: cost },
  total_cost: cost,
  input: "{}",
  output: "{}",
  tool_definitions: {},
  tool_calls: [],
  tool_call_names: [],
  created_at: ts,
  updated_at: ts,
  event_ts: ts,
  is_deleted: 0,
});

async function main() {
  await cleanup();
  const writer = GreptimeWriter.getInstance();

  writer.addToQueue(GreptimeTable.Traces, trace("tr1", D1));
  writer.addToQueue(GreptimeTable.Traces, trace("tr2", D2));
  // D1 obs has a custom usage key `input_cached` that must count into inputUsage.
  writer.addToQueue(
    GreptimeTable.Observations,
    observation(
      "ob1",
      "tr1",
      D1,
      { input: 10, output: 20, total: 30, input_cached: 5 },
      0.1,
    ),
  );
  writer.addToQueue(
    GreptimeTable.Observations,
    observation("ob2", "tr2", D2, { input: 100, output: 200, total: 300 }, 0.5),
  );

  await writer.flushAll(true);
  await sleep(500);

  const days = await generateDailyMetrics({
    projectId: SMOKE_PROJECT,
    filter: new FilterList([]),
    pagination: { limit: 50, page: 1 },
  });
  check("two days returned", days.length === 2, days.length);
  // ORDER BY date DESC -> D2 first.
  const d1 = days.find((d) => d.date === "2026-06-01");
  const d2 = days.find((d) => d.date === "2026-06-02");

  check("D1 countTraces = 1", d1?.countTraces === 1, d1?.countTraces);
  check(
    "D1 countObservations = 1",
    d1?.countObservations === 1,
    d1?.countObservations,
  );
  check("D1 totalCost = 0.1", approx(d1?.totalCost ?? -1, 0.1), d1?.totalCost);

  const u1 = d1?.usage.find((u) => u.model === "gpt-4o");
  check(
    "D1 inputUsage = 15 (input + input_cached substring match)",
    u1?.inputUsage === 15,
    u1?.inputUsage,
  );
  check("D1 outputUsage = 20", u1?.outputUsage === 20, u1?.outputUsage);
  check(
    "D1 totalUsage = 30 (exact 'total' key)",
    u1?.totalUsage === 30,
    u1?.totalUsage,
  );

  check(
    "D2 inputUsage = 100",
    d2?.usage[0]?.inputUsage === 100,
    d2?.usage[0]?.inputUsage,
  );
  check("D2 totalCost = 0.5", approx(d2?.totalCost ?? -1, 0.5), d2?.totalCost);

  const count = await getDailyMetricsCount({
    projectId: SMOKE_PROJECT,
    filter: new FilterList([]),
  });
  check("distinct day count = 2", count === 2, count);

  await cleanup();
  await writer.shutdown();
  await closeGreptimeConnections();

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
