/**
 * Smoke test for P5 Piece A — scattered small reads collapsed to the GreptimeDB projection.
 * Run from the worker package:
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimePieceASmoke.ts
 *
 * Seeds a self-contained fixture and asserts:
 *   - getTracesByIdsForAnyProject (cross-project id lookup, dedup by (project_id, id))
 *   - getObservationCountsByProjectAndDay (per-project per-UTC-day counts)
 *   - greptimeObservationReads.getModelLastUsedByIds (MAX(start_time) per internal_model_id)
 *   - probeRecentTracingActivity (readiness probe over the merged projections)
 *
 * Idempotent: deletes its own fixture (project_id = SMOKE_PROJECT) before and after.
 */
import {
  greptimeQuery,
  closeGreptimeConnections,
  getTracesByIdsForAnyProject,
  getObservationCountsByProjectAndDay,
  greptimeObservationReads,
  probeRecentTracingActivity,
  type ObservationRecordInsertType,
  type TraceRecordInsertType,
} from "@langfuse/shared/src/server";
import { GreptimeWriter, GreptimeTable } from "../services/GreptimeWriter";

const SMOKE_PROJECT = "smoke-piece-a-0001";
const MODEL = "smoke-model-a";
const D1 = Date.UTC(2026, 5, 1, 10, 0, 0);
const D2 = Date.UTC(2026, 5, 2, 10, 0, 0);
const PROBE_TS = Date.UTC(2026, 5, 13, 12, 0, 0);

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined && !ok ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};
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
  internal_model_id: MODEL,
  model_parameters: "{}",
  provided_usage_details: {},
  usage_details: {},
  provided_cost_details: {},
  cost_details: {},
  total_cost: 0,
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

const dayStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function main() {
  await cleanup();
  const writer = GreptimeWriter.getInstance();

  writer.addToQueue(GreptimeTable.Traces, trace("pa-tr1", D1));
  writer.addToQueue(GreptimeTable.Traces, trace("pa-tr2", D2));
  writer.addToQueue(GreptimeTable.Traces, trace("pa-tr-recent", PROBE_TS));
  writer.addToQueue(
    GreptimeTable.Observations,
    observation("pa-ob1", "pa-tr1", D1),
  );
  writer.addToQueue(
    GreptimeTable.Observations,
    observation("pa-ob2", "pa-tr2", D2),
  );
  writer.addToQueue(
    GreptimeTable.Observations,
    observation("pa-ob-recent", "pa-tr-recent", PROBE_TS),
  );
  await writer.flushAll(true);
  await sleep(500);

  // 1. getTracesByIdsForAnyProject
  const byId = await getTracesByIdsForAnyProject(["pa-tr1", "pa-tr2"]);
  const mine = byId.filter((r) => r.projectId === SMOKE_PROJECT);
  check(
    "getTracesByIdsForAnyProject returns both ids",
    mine.length === 2,
    mine,
  );
  check(
    "getTracesByIdsForAnyProject shape {id, projectId}",
    mine.every((r) => r.id && r.projectId === SMOKE_PROJECT),
    mine,
  );
  const empty = await getTracesByIdsForAnyProject([]);
  check("getTracesByIdsForAnyProject([]) = []", empty.length === 0);

  // 2. getObservationCountsByProjectAndDay
  const counts = await getObservationCountsByProjectAndDay({
    startDate: new Date(D1 - 1000),
    endDate: new Date(D2 + 24 * 60 * 60 * 1000),
  });
  const c1 = counts.find(
    (r) => r.projectId === SMOKE_PROJECT && r.date === dayStr(D1),
  );
  const c2 = counts.find(
    (r) => r.projectId === SMOKE_PROJECT && r.date === dayStr(D2),
  );
  check("obs count D1 = 1", c1?.count === 1, c1);
  check("obs count D2 = 1", c2?.count === 1, c2);

  // 3. getModelLastUsedByIds (MAX over D1/D2 -> D2)
  const lastUsed = await greptimeObservationReads.getModelLastUsedByIds({
    projectId: SMOKE_PROJECT,
    modelIds: [MODEL],
  });
  const row = lastUsed.find((r) => r.modelId === MODEL);
  check("getModelLastUsedByIds returns model", !!row, lastUsed);
  check(
    "getModelLastUsedByIds lastUsed = MAX(start_time) = PROBE_TS",
    row?.lastUsed instanceof Date && row.lastUsed.getTime() === PROBE_TS,
    row?.lastUsed,
  );
  const none = await greptimeObservationReads.getModelLastUsedByIds({
    projectId: SMOKE_PROJECT,
    modelIds: [],
  });
  check("getModelLastUsedByIds([]) = []", none.length === 0);

  // 4. probeRecentTracingActivity (cross-project; our recent row guarantees positive)
  const probe = await probeRecentTracingActivity({
    now: new Date(PROBE_TS + 30_000),
    windowMinutes: 5,
  });
  check("probe hasTrace within window", probe.hasTrace === true, probe);
  check(
    "probe hasObservation within window",
    probe.hasObservation === true,
    probe,
  );

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
