/**
 * Smoke test for the GreptimeDB write path (02-write-path.md, steps 2/5/6).
 * Run from the worker package:
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeWriteSmoke.ts
 *
 * Exercises the real modules against the local openfuse database:
 *   1. writeRawEvents + readRawEventsForEntity + parseRawEventHistory (raw_events round-trip, dedup)
 *   2. GreptimeWriter projection + EAV fan-out (traces/observations/scores + *_metadata/*_tags)
 *   3. cost DECIMAL(38,12) precision and metadata last_non_null merge
 *
 * Idempotent: it deletes its own fixtures (project_id = SMOKE_PROJECT) before and after.
 */
import {
  greptimeQuery,
  closeGreptimeConnections,
  type ObservationRecordInsertType,
  type ScoreRecordInsertType,
  type TraceRecordInsertType,
} from "@langfuse/shared/src/server";
import {
  writeRawEvents,
  readRawEventsForEntity,
} from "@langfuse/shared/src/server";
import { parseRawEventHistory } from "@langfuse/shared/src/server";
import { GreptimeWriter, GreptimeTable } from "../services/GreptimeWriter";

const SMOKE_PROJECT = "smoke-project-0001";
const TRACE_ID = "smoke-trace-1";
const OBS_ID = "smoke-obs-1";
const SCORE_ID = "smoke-score-1";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined && !ok ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const cleanup = async () => {
  // raw_events is append_mode -> DELETE is rejected by the engine. We isolate raw_events fixtures
  // with a per-run entity id instead (see RUN below), and rely on TTL for real retention.
  const tables = [
    "traces",
    "observations",
    "scores",
    "traces_metadata",
    "observations_metadata",
    "scores_metadata",
    "traces_tags",
  ];
  for (const t of tables) {
    await greptimeQuery({
      query: `DELETE FROM \`${t}\` WHERE \`project_id\` = ?`,
      params: [SMOKE_PROJECT],
    });
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await cleanup();

  // -------------------------------------------------------------------------
  // 1. raw_events round-trip + dedup
  // -------------------------------------------------------------------------
  const now = Date.now();
  // Per-run entity id keeps the append-only raw_events fixtures isolated across re-runs.
  const RAW_ENTITY = `smoke-raw-${now}`;
  const RAW_EVENT_ID = `evt-${now}`;
  const traceCreate = {
    id: RAW_EVENT_ID,
    type: "trace-create",
    timestamp: new Date(now).toISOString(),
    body: {
      id: RAW_ENTITY,
      name: "smoke",
      timestamp: new Date(now).toISOString(),
    },
  };
  await writeRawEvents([
    {
      projectId: SMOKE_PROJECT,
      entityType: "trace",
      entityId: RAW_ENTITY,
      eventId: traceCreate.id,
      eventType: traceCreate.type,
      eventTs: now,
      ingestedAt: now,
      body: JSON.stringify(traceCreate),
    },
    // duplicate event_id (re-delivery) — must be deduped on read
    {
      projectId: SMOKE_PROJECT,
      entityType: "trace",
      entityId: RAW_ENTITY,
      eventId: traceCreate.id,
      eventType: traceCreate.type,
      eventTs: now,
      ingestedAt: now + 1,
      body: JSON.stringify(traceCreate),
    },
  ]);

  const rows = await readRawEventsForEntity({
    projectId: SMOKE_PROJECT,
    entityType: "trace",
    entityId: RAW_ENTITY,
  });
  check("raw_events: 2 rows appended", rows.length === 2, rows.length);

  const history = parseRawEventHistory(rows);
  check(
    "raw_events: deduped to 1 event by event_id",
    history.events.length === 1,
    history.events.length,
  );
  check(
    "raw_events: body round-trips",
    (history.events[0] as { body?: { id?: string } })?.body?.id === RAW_ENTITY,
  );

  // #1 ordering: two same-timestamp events, request order A then B, but event_ids in REVERSE
  // lexicographic order (A="zzz", B="aaa"). The ingested_at offset must keep request order on read,
  // so B (later request) sorts last and wins the merge — not A (smaller event_id).
  const ORD_ENTITY = `smoke-order-${now}`;
  const ordTs = new Date(now).toISOString();
  await writeRawEvents([
    {
      projectId: SMOKE_PROJECT,
      entityType: "trace",
      entityId: ORD_ENTITY,
      eventId: "zzz-first",
      eventType: "trace-create",
      eventTs: now,
      ingestedAt: now, // request index 0
      body: JSON.stringify({
        id: "zzz-first",
        type: "trace-create",
        timestamp: ordTs,
        body: { id: ORD_ENTITY, name: "A", timestamp: ordTs },
      }),
    },
    {
      projectId: SMOKE_PROJECT,
      entityType: "trace",
      entityId: ORD_ENTITY,
      eventId: "aaa-second",
      eventType: "trace-create",
      eventTs: now,
      ingestedAt: now + 1, // request index 1
      body: JSON.stringify({
        id: "aaa-second",
        type: "trace-create",
        timestamp: ordTs,
        body: { id: ORD_ENTITY, name: "B", timestamp: ordTs },
      }),
    },
  ]);
  const ordHist = parseRawEventHistory(
    await readRawEventsForEntity({
      projectId: SMOKE_PROJECT,
      entityType: "trace",
      entityId: ORD_ENTITY,
    }),
  );
  const ordNames = ordHist.events.map(
    (e) => (e as { body?: { name?: string } }).body?.name,
  );
  check(
    "raw_events: read preserves request order over event_id (A,B not B,A)",
    ordNames.join(",") === "A,B",
    ordNames,
  );

  // -------------------------------------------------------------------------
  // 2. GreptimeWriter projection + EAV
  // -------------------------------------------------------------------------
  const writer = GreptimeWriter.getInstance();

  const trace: TraceRecordInsertType = {
    id: TRACE_ID,
    project_id: SMOKE_PROJECT,
    timestamp: now,
    name: "smoke-trace",
    environment: "default",
    user_id: "u1",
    session_id: "s1",
    release: "r1",
    version: "v1",
    metadata: { env: "prod", team: "ai" },
    tags: ["alpha", "beta"],
    public: false,
    bookmarked: false,
    input: '{"q":"hi"}',
    output: '{"a":"yo"}',
    created_at: now,
    updated_at: now,
    event_ts: now,
    is_deleted: 0,
  };

  const observation: ObservationRecordInsertType = {
    id: OBS_ID,
    project_id: SMOKE_PROJECT,
    trace_id: TRACE_ID,
    type: "GENERATION",
    environment: "default",
    name: "gen",
    level: "DEFAULT",
    start_time: now,
    end_time: now + 1000,
    metadata: { model_kind: "chat" },
    provided_model_name: "gpt-4o",
    internal_model_id: "m1",
    model_parameters: JSON.stringify({ temperature: 0.7 }),
    provided_usage_details: { input: 10, output: 20 },
    usage_details: { input: 10, output: 20, total: 30 },
    provided_cost_details: {},
    cost_details: {
      input: 0.000123456789,
      output: 0.000987654321,
      total: 0.00111111111,
    },
    total_cost: 0.00111111111,
    input: '{"prompt":"x"}',
    output: '{"completion":"y"}',
    tool_definitions: {},
    tool_calls: [],
    tool_call_names: [],
    created_at: now,
    updated_at: now,
    event_ts: now,
    is_deleted: 0,
  };

  const score: ScoreRecordInsertType = {
    id: SCORE_ID,
    project_id: SMOKE_PROJECT,
    trace_id: TRACE_ID,
    observation_id: OBS_ID,
    timestamp: now,
    name: "quality",
    value: 0.95,
    source: "API",
    data_type: "NUMERIC",
    environment: "default",
    string_value: null,
    long_string_value: "",
    comment: "looks good",
    metadata: { rater: "auto" },
    created_at: now,
    updated_at: now,
    event_ts: now,
    is_deleted: 0,
  };

  writer.addToQueue(GreptimeTable.Traces, trace);
  writer.addToQueue(GreptimeTable.Observations, observation);
  writer.addToQueue(GreptimeTable.Scores, score);
  await writer.flushAll(true);
  await sleep(500); // let the server settle the merge

  const traceRow = await greptimeQuery<{
    name: string;
    metadata: string;
    tags: string;
  }>({
    query:
      "SELECT `name`, `metadata`, `tags` FROM `traces` WHERE `project_id` = ? AND `id` = ? LIMIT 1",
    params: [SMOKE_PROJECT, TRACE_ID],
  });
  check("traces: projection row written", traceRow.length === 1);
  check(
    "traces: name merged",
    traceRow[0]?.name === "smoke-trace",
    traceRow[0]?.name,
  );

  const traceMeta = await greptimeQuery<{ key: string; value: string }>({
    query:
      "SELECT `key`, `value` FROM `traces_metadata` WHERE `project_id` = ? AND `entity_id` = ? ORDER BY `key`",
    params: [SMOKE_PROJECT, TRACE_ID],
  });
  check("traces_metadata: 2 EAV rows", traceMeta.length === 2, traceMeta);
  check(
    "traces_metadata: semi-join value",
    traceMeta.some((m) => m.key === "env" && m.value === "prod"),
    traceMeta,
  );

  const traceTags = await greptimeQuery<{ tag: string }>({
    query:
      "SELECT `tag` FROM `traces_tags` WHERE `project_id` = ? AND `entity_id` = ? ORDER BY `tag`",
    params: [SMOKE_PROJECT, TRACE_ID],
  });
  check("traces_tags: 2 tag rows", traceTags.length === 2, traceTags);

  const obsRow = await greptimeQuery<{
    total_cost: string;
    total_usage: string;
    input_cost: string;
  }>({
    query:
      "SELECT `total_cost`, `total_usage`, `input_cost` FROM `observations` WHERE `project_id` = ? AND `id` = ? LIMIT 1",
    params: [SMOKE_PROJECT, OBS_ID],
  });
  check("observations: projection row written", obsRow.length === 1);
  check(
    "observations: cost DECIMAL precision preserved",
    obsRow[0]?.input_cost === "0.000123456789",
    obsRow[0]?.input_cost,
  );
  check(
    "observations: total_usage flattened",
    Number(obsRow[0]?.total_usage) === 30,
    obsRow[0]?.total_usage,
  );

  const scoreRow = await greptimeQuery<{ value: number; name: string }>({
    query:
      "SELECT `value`, `name` FROM `scores` WHERE `project_id` = ? AND `id` = ? LIMIT 1",
    params: [SMOKE_PROJECT, SCORE_ID],
  });
  check("scores: projection row written", scoreRow.length === 1);
  check(
    "scores: value",
    Number(scoreRow[0]?.value) === 0.95,
    scoreRow[0]?.value,
  );

  // -------------------------------------------------------------------------
  // 3. metadata last_non_null merge (update a key, drop none)
  // -------------------------------------------------------------------------
  writer.addToQueue(GreptimeTable.Traces, {
    ...trace,
    metadata: { env: "staging", team: "ai" }, // env prod -> staging
  });
  await writer.flushAll(true);
  await sleep(500);
  const merged = await greptimeQuery<{ value: string }>({
    query:
      "SELECT `value` FROM `traces_metadata` WHERE `project_id` = ? AND `entity_id` = ? AND `key` = ? LIMIT 1",
    params: [SMOKE_PROJECT, TRACE_ID, "env"],
  });
  check(
    "traces_metadata: last_non_null update env=staging",
    merged[0]?.value === "staging",
    merged,
  );

  await cleanup();
  await writer.shutdown();
  await closeGreptimeConnections();

  console.log(
    `\n${failures === 0 ? "ALL SMOKE CHECKS PASSED" : `${failures} SMOKE CHECK(S) FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("smoke test crashed", err);
  process.exit(1);
});
