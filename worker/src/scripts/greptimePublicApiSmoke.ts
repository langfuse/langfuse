/**
 * Smoke test for P5 Piece B — public-API generators collapsed to the GreptimeDB projection.
 * Run from the worker package:
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimePublicApiSmoke.ts
 *
 * Seeds a self-contained fixture and asserts traces / observations / scores public-API generators:
 *   - generateTracesForPublicApi field groups (observations[]/scores[]/metrics/io) + count + filter
 *   - generateObservationsForPublicApi (+ count) incl. a trace-join filter
 *   - _handleGenerateScoresForPublicApi scope (traces_only vs all) + trace embed + count
 *   - listScoresV3ForPublicApi cursor keyset paging + dynamic filter
 *
 * Idempotent: deletes its own fixture (project_id = SMOKE_PROJECT) before and after.
 */
import {
  greptimeQuery,
  closeGreptimeConnections,
  generateTracesForPublicApi,
  getTracesCountForPublicApi,
  generateObservationsForPublicApi,
  getObservationsCountForPublicApi,
  _handleGenerateScoresForPublicApi,
  _handleGetScoresCountForPublicApi,
  listScoresV3ForPublicApi,
  FilterList,
  StringFilter,
  type ObservationRecordInsertType,
  type ScoreRecordInsertType,
  type TraceRecordInsertType,
} from "@langfuse/shared/src/server";
import { GreptimeWriter, GreptimeTable } from "../services/GreptimeWriter";

const SMOKE_PROJECT = "smoke-public-api-0001";
const T = Date.UTC(2026, 5, 10, 10, 0, 0);

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
  for (const table of ["scores", "observations", "traces"]) {
    await greptimeQuery({
      query: `DELETE FROM \`${table}\` WHERE \`project_id\` = ?`,
      params: [SMOKE_PROJECT],
    });
  }
};

const trace = (
  id: string,
  ts: number,
  userId: string,
): TraceRecordInsertType => ({
  id,
  project_id: SMOKE_PROJECT,
  timestamp: ts,
  name: "t",
  environment: "default",
  user_id: userId,
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
  provided_usage_details: {},
  usage_details: {},
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

const score = (
  id: string,
  ts: number,
  opts: {
    traceId?: string | null;
    sessionId?: string | null;
    name: string;
    value?: number;
    categorical?: string | null;
  },
): ScoreRecordInsertType => ({
  id,
  project_id: SMOKE_PROJECT,
  trace_id: opts.traceId ?? null,
  observation_id: null,
  session_id: opts.sessionId ?? null,
  timestamp: ts,
  name: opts.name,
  value: opts.value ?? 0,
  source: "API",
  data_type: opts.categorical ? "CATEGORICAL" : "NUMERIC",
  environment: "default",
  string_value: opts.categorical ?? null,
  long_string_value: "",
  comment: null,
  metadata: {},
  created_at: ts,
  updated_at: ts,
  event_ts: ts,
  is_deleted: 0,
});

async function main() {
  await cleanup();
  const writer = GreptimeWriter.getInstance();

  writer.addToQueue(GreptimeTable.Traces, trace("pb-t1", T, "u1"));
  writer.addToQueue(GreptimeTable.Traces, trace("pb-t2", T + 60_000, "u2"));
  writer.addToQueue(
    GreptimeTable.Observations,
    observation("pb-o1", "pb-t1", T, 0.1),
  );
  writer.addToQueue(
    GreptimeTable.Observations,
    observation("pb-o2", "pb-t1", T + 1000, 0.2),
  );
  writer.addToQueue(
    GreptimeTable.Observations,
    observation("pb-o3", "pb-t1", T + 2000, 0.3),
  );
  writer.addToQueue(
    GreptimeTable.Observations,
    observation("pb-o4", "pb-t2", T + 60_000, 0.5),
  );
  // trace-attached scores on pb-t1
  writer.addToQueue(
    GreptimeTable.Scores,
    score("pb-sc1", T + 1000, {
      traceId: "pb-t1",
      name: "quality",
      value: 0.8,
    }),
  );
  writer.addToQueue(
    GreptimeTable.Scores,
    score("pb-sc2", T + 2000, {
      traceId: "pb-t1",
      name: "sentiment",
      categorical: "positive",
    }),
  );
  // session-attached score (trace_id null)
  writer.addToQueue(
    GreptimeTable.Scores,
    score("pb-sc3", T + 3000, {
      sessionId: "sess-x",
      name: "session_q",
      value: 0.5,
    }),
  );

  await writer.flushAll(true);
  await sleep(500);

  // ── traces ──────────────────────────────────────────────────────────────
  const tracesFull = await generateTracesForPublicApi({
    projectId: SMOKE_PROJECT,
    filter: new FilterList([]),
    orderBy: null,
    pagination: { limit: 50, page: 1 },
    fields: ["core", "io", "scores", "observations", "metrics"],
  });
  check("traces: 2 returned", tracesFull.length === 2, tracesFull.length);
  const t1 = tracesFull.find((t) => t.id === "pb-t1");
  check(
    "trace1 observations[] = 3",
    t1?.observations.length === 3,
    t1?.observations,
  );
  check("trace1 scores[] = 2", t1?.scores.length === 2, t1?.scores);
  check(
    "trace1 totalCost ~ 0.6",
    approx(t1?.totalCost ?? -1, 0.6),
    t1?.totalCost,
  );
  check("trace1 latency > 0", (t1?.latency ?? 0) > 0, t1?.latency);
  check(
    "trace1 htmlPath",
    t1?.htmlPath === `/project/${SMOKE_PROJECT}/traces/pb-t1`,
    t1?.htmlPath,
  );

  const tracesCore = await generateTracesForPublicApi({
    projectId: SMOKE_PROJECT,
    filter: new FilterList([]),
    orderBy: null,
    pagination: { limit: 50, page: 1 },
    fields: ["core"],
  });
  const t1c = tracesCore.find((t) => t.id === "pb-t1");
  check(
    "core-only: excluded fields defaulted",
    t1c?.observations.length === 0 &&
      t1c?.scores.length === 0 &&
      t1c?.totalCost === -1 &&
      t1c?.latency === -1,
    {
      obs: t1c?.observations,
      totalCost: t1c?.totalCost,
      latency: t1c?.latency,
    },
  );

  const traceCount = await getTracesCountForPublicApi({
    projectId: SMOKE_PROJECT,
    filter: new FilterList([]),
  });
  check("traces count = 2", traceCount === 2, traceCount);

  const tracesU1 = await generateTracesForPublicApi({
    projectId: SMOKE_PROJECT,
    filter: new FilterList([
      new StringFilter({
        clickhouseTable: "traces",
        field: "user_id",
        operator: "=",
        value: "u1",
        tablePrefix: "t",
      }),
    ]),
    orderBy: null,
    pagination: { limit: 50, page: 1 },
    fields: ["core"],
  });
  check(
    "traces userId=u1 filter -> 1",
    tracesU1.length === 1 && tracesU1[0].id === "pb-t1",
    tracesU1.map((t) => t.id),
  );

  // ── observations ─────────────────────────────────────────────────────────
  const obsAll = await generateObservationsForPublicApi({
    projectId: SMOKE_PROJECT,
    filter: new FilterList([]),
    pagination: { limit: 50, page: 1 },
  });
  check("observations: 4 returned", obsAll.length === 4, obsAll.length);
  const obsCount = await getObservationsCountForPublicApi({
    projectId: SMOKE_PROJECT,
    filter: new FilterList([]),
  });
  check("observations count = 4", obsCount === 4, obsCount);

  const obsU2 = await generateObservationsForPublicApi({
    projectId: SMOKE_PROJECT,
    filter: new FilterList([
      new StringFilter({
        clickhouseTable: "traces",
        field: "user_id",
        operator: "=",
        value: "u2",
        tablePrefix: "t",
      }),
    ]),
    pagination: { limit: 50, page: 1 },
  });
  check(
    "observations trace-join userId=u2 -> 1 (pb-o4)",
    obsU2.length === 1 && obsU2[0].id === "pb-o4",
    obsU2.map((o) => o.id),
  );

  // ── scores ────────────────────────────────────────────────────────────────
  const scoresAll = await _handleGenerateScoresForPublicApi({
    projectId: SMOKE_PROJECT,
    scoresFilter: new FilterList([]),
    tracesFilter: new FilterList([]),
    scoreScope: "all",
    includeTrace: false,
    needsTraceJoin: false,
    pagination: { limit: 50, page: 1 },
  });
  check("scores scope=all -> 3", scoresAll.length === 3, scoresAll.length);

  const scoresTracesOnly = await _handleGenerateScoresForPublicApi({
    projectId: SMOKE_PROJECT,
    scoresFilter: new FilterList([]),
    tracesFilter: new FilterList([]),
    scoreScope: "traces_only",
    includeTrace: false,
    needsTraceJoin: false,
  });
  check(
    "scores scope=traces_only -> 2 (session score excluded)",
    scoresTracesOnly.length === 2,
    scoresTracesOnly.map((s) => s.id),
  );

  const scoresWithTrace = await _handleGenerateScoresForPublicApi({
    projectId: SMOKE_PROJECT,
    scoresFilter: new FilterList([]),
    tracesFilter: new FilterList([
      new StringFilter({
        clickhouseTable: "traces",
        field: "user_id",
        operator: "=",
        value: "u1",
        tablePrefix: "t",
      }),
    ]),
    scoreScope: "all",
    includeTrace: true,
    needsTraceJoin: true,
  });
  check(
    "scores trace-join u1 -> 2 with trace embed",
    scoresWithTrace.length === 2 &&
      scoresWithTrace.every((s) => s.trace?.userId === "u1"),
    scoresWithTrace.map((s) => ({ id: s.id, trace: s.trace })),
  );

  const scoreCountAll = await _handleGetScoresCountForPublicApi({
    projectId: SMOKE_PROJECT,
    scoresFilter: new FilterList([]),
    tracesFilter: new FilterList([]),
    scoreScope: "all",
    includeTrace: false,
    needsTraceJoin: false,
  });
  check("scores count scope=all -> 3", scoreCountAll === 3, scoreCountAll);

  // ── v3 cursor keyset ───────────────────────────────────────────────────────
  const v3all = await listScoresV3ForPublicApi({
    projectId: SMOKE_PROJECT,
    limit: 10,
    fields: ["subject"],
  });
  check(
    "v3 list (no cursor) -> 3, no next cursor",
    v3all.data.length === 3 && !v3all.cursor,
    {
      n: v3all.data.length,
      cursor: v3all.cursor,
    },
  );
  // ORDER BY timestamp DESC -> [sc3, sc2, sc1]
  check(
    "v3 order desc: first is session_q (pb-sc3)",
    v3all.data[0]?.id === "pb-sc3",
    v3all.data.map((d) => d.id),
  );

  const v3page1 = await listScoresV3ForPublicApi({
    projectId: SMOKE_PROJECT,
    limit: 2,
    fields: ["subject"],
  });
  check(
    "v3 page1 limit=2 -> 2 + cursor",
    v3page1.data.length === 2 && Boolean(v3page1.cursor),
    {
      n: v3page1.data.length,
      cursor: Boolean(v3page1.cursor),
    },
  );

  // keyset: cursor at pb-sc2 (ts T+2000) -> remaining older -> pb-sc1
  const cursor = {
    v: 1 as const,
    lastTimestamp: new Date(T + 2000),
    lastId: "pb-sc2",
  };
  const v3page2 = await listScoresV3ForPublicApi({
    projectId: SMOKE_PROJECT,
    limit: 10,
    cursor,
    fields: ["subject"],
  });
  check(
    "v3 keyset after pb-sc2 -> [pb-sc1]",
    v3page2.data.length === 1 && v3page2.data[0]?.id === "pb-sc1",
    v3page2.data.map((d) => d.id),
  );

  const v3byName = await listScoresV3ForPublicApi({
    projectId: SMOKE_PROJECT,
    limit: 10,
    name: ["quality"],
    fields: ["subject"],
  });
  check(
    "v3 name=quality filter -> [pb-sc1]",
    v3byName.data.length === 1 && v3byName.data[0]?.id === "pb-sc1",
    v3byName.data.map((d) => d.id),
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
