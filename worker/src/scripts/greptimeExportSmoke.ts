/**
 * Smoke test for P5 Piece C — batch-export streaming collapsed to the GreptimeDB projection.
 * Run from the worker package:
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeExportSmoke.ts
 *
 * Exercises the shared keyset page generators that back the worker export streams
 * (trace/observation/event streams all page through these):
 *   - same-timestamp ties page without loss or duplication (composite (time,id) cursor)
 *   - rowLimit is honoured
 *   - observation export rows carry the trace-denormalised fields the events export needs
 *   - filters narrow the scan
 *
 * Idempotent: deletes its own fixture (project_id = SMOKE_PROJECT) before and after.
 */
import {
  greptimeQuery,
  closeGreptimeConnections,
  streamTracesForExport,
  streamObservationsForExport,
  type ObservationRecordInsertType,
  type TraceRecordInsertType,
} from "@langfuse/shared/src/server";
import type { FilterCondition } from "@langfuse/shared";
import { GreptimeWriter, GreptimeTable } from "../services/GreptimeWriter";

const SMOKE_PROJECT = "smoke-export-0001";
const T = Date.UTC(2026, 5, 11, 10, 0, 0); // all rows share this timestamp (tie test)
const CUTOFF = new Date(T + 60_000);
const IDS = ["ex-a", "ex-b", "ex-c", "ex-d", "ex-e"];

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

const trace = (id: string, userId: string): TraceRecordInsertType => ({
  id,
  project_id: SMOKE_PROJECT,
  timestamp: T,
  name: "t",
  environment: "default",
  user_id: userId,
  session_id: "sess-1",
  release: "rel-1",
  version: null,
  metadata: {},
  tags: ["x"],
  public: false,
  bookmarked: false,
  input: "{}",
  output: "{}",
  created_at: T,
  updated_at: T,
  event_ts: T,
  is_deleted: 0,
});

const observation = (
  id: string,
  traceId: string,
): ObservationRecordInsertType => ({
  id,
  project_id: SMOKE_PROJECT,
  trace_id: traceId,
  type: "GENERATION",
  environment: "default",
  name: "gen",
  level: "DEFAULT",
  start_time: T,
  end_time: T + 1000,
  metadata: {},
  provided_model_name: "gpt-4o",
  internal_model_id: "m1",
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
  created_at: T,
  updated_at: T,
  event_ts: T,
  is_deleted: 0,
});

const collect = async <T>(gen: AsyncGenerator<T[]>): Promise<T[]> => {
  const out: T[] = [];
  for await (const page of gen) out.push(...page);
  return out;
};

async function main() {
  await cleanup();
  const writer = GreptimeWriter.getInstance();
  IDS.forEach((id, i) => {
    writer.addToQueue(GreptimeTable.Traces, trace(id, i < 3 ? "u1" : "u2"));
    writer.addToQueue(GreptimeTable.Observations, observation(`o-${id}`, id));
  });
  await writer.flushAll(true);
  await sleep(500);

  const noFilter: FilterCondition[] = [];

  // 1. traces: same-ts tie paging (pageSize=2) -> no loss / no dup
  const traceRows = await collect(
    streamTracesForExport({
      projectId: SMOKE_PROJECT,
      filter: noFilter,
      cutoffCreatedAt: CUTOFF,
      rowLimit: 100,
      pageSize: 2,
    }),
  );
  const traceIds = traceRows.map((t) => t.id);
  check("traces: all 5 returned", traceRows.length === 5, traceRows.length);
  check(
    "traces: no dup across same-ts pages",
    new Set(traceIds).size === 5,
    traceIds,
  );
  check(
    "traces: complete set",
    IDS.every((id) => traceIds.includes(id)),
    traceIds,
  );
  // DESC by (timestamp, id): all same ts -> id desc
  check(
    "traces: ordered by id desc on ts tie",
    JSON.stringify(traceIds) === JSON.stringify([...IDS].sort().reverse()),
    traceIds,
  );

  // 2. rowLimit honoured
  const limited = await collect(
    streamTracesForExport({
      projectId: SMOKE_PROJECT,
      filter: noFilter,
      cutoffCreatedAt: CUTOFF,
      rowLimit: 3,
      pageSize: 2,
    }),
  );
  check("traces: rowLimit=3 -> 3", limited.length === 3, limited.length);

  // 3. filter narrows
  const u1 = await collect(
    streamTracesForExport({
      projectId: SMOKE_PROJECT,
      filter: [
        { column: "User ID", operator: "=", value: "u1", type: "string" },
      ],
      cutoffCreatedAt: CUTOFF,
      rowLimit: 100,
      pageSize: 10,
    }),
  );
  check("traces: userId=u1 -> 3", u1.length === 3, u1.length);

  // 4. observations export rows carry trace-denormalised fields + tie paging
  const obsRows = await collect(
    streamObservationsForExport({
      projectId: SMOKE_PROJECT,
      filter: noFilter,
      cutoffCreatedAt: CUTOFF,
      rowLimit: 100,
      pageSize: 2,
    }),
  );
  check("observations: all 5 returned", obsRows.length === 5, obsRows.length);
  check(
    "observations: no dup across same-ts pages",
    new Set(obsRows.map((o) => o.id)).size === 5,
    obsRows.map((o) => o.id),
  );
  const sample = obsRows[0];
  check(
    "observations: trace-denormalised fields populated",
    sample?.traceName === "t" &&
      (sample?.userId === "u1" || sample?.userId === "u2") &&
      sample?.traceSessionId === "sess-1" &&
      sample?.traceRelease === "rel-1" &&
      Array.isArray(sample?.traceTags),
    {
      traceName: sample?.traceName,
      userId: sample?.userId,
      traceSessionId: sample?.traceSessionId,
      traceRelease: sample?.traceRelease,
      traceTags: sample?.traceTags,
    },
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
