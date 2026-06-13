/**
 * Smoke for the GAP-MUT write path (tRPC UI mutations on GreptimeDB).
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeMutationSmoke.ts
 *
 * upsertTrace / upsertScore now write the GreptimeDB projection directly (the read path is
 * GreptimeDB-only), mirroring the legacy upsertClickhouse semantics:
 *   - trace bookmark/publish: direct projection write (immediate visibility) + a synthetic
 *     `trace-create` appended to raw_events; a full-history rebuild restores the toggle (the worker
 *     `mapTraceEventsToRecords` reads `bookmarked` from the body). A LATER genuine trace event still
 *     clobbers it — same as upstream Langfuse — which this smoke asserts as the expected behavior.
 *   - scores: projection-only (annotation/manual scores have no faithfully-replayable ingestion
 *     event), asserted across all data types so the value-column mapping is exercised.
 */
import { redis, clickhouseClient } from "@langfuse/shared/src/server";
import {
  upsertTrace,
  upsertScore,
  greptimeQuery,
  closeGreptimeConnections,
  writeRawEvents,
  readRawEventsForEntity,
  parseRawEventHistory,
  deleteEntityFromGreptime,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import { GreptimeWriter } from "../services/GreptimeWriter";
import { IngestionService } from "../services/IngestionService";

const PROJECT = "smoke-mutation-project";
const RUN = Date.now();

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ClickHouse-format datetime string (UTC, space-separated) — the shape upsert* expects. */
const chDate = (d: Date): string =>
  d.toISOString().replace("T", " ").replace("Z", "");

const traceRecord = (id: string, bookmarked: boolean, isPublic: boolean) => {
  const ts = chDate(new Date(RUN - 60_000));
  return {
    id,
    project_id: PROJECT,
    timestamp: ts,
    name: "mutation-smoke-trace",
    environment: "default",
    user_id: "u-1",
    session_id: null,
    release: null,
    version: null,
    metadata: { origin: "smoke" } as Record<string, string>,
    tags: ["x"],
    public: isPublic,
    bookmarked,
    input: "in",
    output: "out",
    created_at: ts,
    updated_at: ts,
    event_ts: chDate(new Date(RUN)),
    is_deleted: 0,
  };
};

/** Replay an entity's full raw_events history through the real rebuildFromHistory merge. */
const rebuild = async (entityId: string, createdAt: Date) => {
  const { events } = parseRawEventHistory(
    await readRawEventsForEntity({
      projectId: PROJECT,
      entityType: "trace",
      entityId,
    }),
  );
  const svc = new IngestionService(
    redis!,
    prisma,
    ClickhouseWriter.getInstance(),
    clickhouseClient(),
    GreptimeWriter.getInstance(),
    /* rebuildFromHistory */ true,
  );
  await svc.mergeAndWrite(
    "trace",
    PROJECT,
    entityId,
    createdAt,
    events as never,
    /* forwardToEventsTable */ false,
  );
  await GreptimeWriter.getInstance().flushAll(true);
  await sleep(700);
};

const traceBookmarked = async (id: string): Promise<number | undefined> => {
  const rows = await greptimeQuery<{ bookmarked: number }>({
    query:
      "SELECT `bookmarked` FROM `traces` WHERE `project_id` = ? AND `id` = ? LIMIT 1",
    params: [PROJECT, id],
  });
  return rows[0]?.bookmarked;
};

async function main() {
  if (!redis) throw new Error("redis unavailable");
  if (!prisma) throw new Error("prisma unavailable");

  // ---------------------------------------------------------------------------
  // 1. trace bookmark: direct projection write + synthetic raw_event
  // ---------------------------------------------------------------------------
  const TRACE_ID = `mut-trace-${RUN}`;
  await upsertTrace(traceRecord(TRACE_ID, /* bookmarked */ true, false));
  await sleep(400);

  check("trace: projection bookmarked visible immediately", Boolean(await traceBookmarked(TRACE_ID))); // prettier-ignore

  const raw = await readRawEventsForEntity({
    projectId: PROJECT,
    entityType: "trace",
    entityId: TRACE_ID,
  });
  check(
    "trace: synthetic trace-create appended to raw_events",
    raw.some((r) => r.event_type === "trace-create"),
    raw.map((r) => r.event_type),
  );

  // publish toggle round-trips the same way.
  await upsertTrace(traceRecord(TRACE_ID, true, /* public */ true));
  await sleep(400);
  const pub = await greptimeQuery<{ public: number }>({
    query:
      "SELECT `public` FROM `traces` WHERE `project_id` = ? AND `id` = ? LIMIT 1",
    params: [PROJECT, TRACE_ID],
  });
  check(
    "trace: projection public visible immediately",
    Boolean(pub[0]?.public),
  );

  // ---------------------------------------------------------------------------
  // 2. full-history rebuild (no later genuine event) restores the bookmark
  // ---------------------------------------------------------------------------
  // Seed a prior genuine ingestion create (bookmarked absent), ingested BEFORE the synthetic one.
  const REPLAY_ID = `mut-trace-replay-${RUN}`;
  const baseTs = new Date(RUN - 120_000).toISOString();
  await writeRawEvents([
    {
      projectId: PROJECT,
      entityType: "trace",
      entityId: REPLAY_ID,
      eventId: `genuine-create-${RUN}`,
      eventType: "trace-create",
      eventTs: new Date(baseTs).getTime(),
      ingestedAt: RUN - 100_000,
      body: JSON.stringify({
        id: `genuine-create-${RUN}`,
        type: "trace-create",
        timestamp: baseTs,
        body: { id: REPLAY_ID, name: "replay-trace", timestamp: baseTs },
      }),
    },
  ]);
  // UI bookmark -> appends synthetic create (ingestedAt = now, i.e. after the genuine one).
  await upsertTrace(traceRecord(REPLAY_ID, true, false));
  await sleep(300);

  await rebuild(REPLAY_ID, new Date(baseTs));
  check(
    "replay: bookmark restored from synthetic event (no later genuine event)",
    Boolean(await traceBookmarked(REPLAY_ID)),
    await traceBookmarked(REPLAY_ID),
  );

  // ---------------------------------------------------------------------------
  // 3. a LATER genuine trace event clobbers the bookmark (expected, upstream-consistent)
  // ---------------------------------------------------------------------------
  await writeRawEvents([
    {
      projectId: PROJECT,
      entityType: "trace",
      entityId: REPLAY_ID,
      eventId: `genuine-later-${RUN}`,
      eventType: "trace-create",
      eventTs: new Date(RUN).getTime(),
      ingestedAt: RUN + 10_000,
      body: JSON.stringify({
        id: `genuine-later-${RUN}`,
        type: "trace-create",
        timestamp: new Date(RUN).toISOString(),
        body: { id: REPLAY_ID, timestamp: new Date(RUN).toISOString() },
      }),
    },
  ]);
  await rebuild(REPLAY_ID, new Date(baseTs));
  check(
    "replay: later genuine event clobbers bookmark to false (expected)",
    !(await traceBookmarked(REPLAY_ID)),
    await traceBookmarked(REPLAY_ID),
  );

  // ---------------------------------------------------------------------------
  // 4. scores: projection-only direct write across all data types (value mapping)
  // ---------------------------------------------------------------------------
  const ts = chDate(new Date(RUN - 60_000));
  const scoreBase = {
    project_id: PROJECT,
    timestamp: ts,
    environment: "default",
    trace_id: `mut-trace-${RUN}`,
    observation_id: null as string | null,
    session_id: null as string | null,
    comment: null as string | null,
    author_user_id: "u-1",
    config_id: null as string | null,
    queue_id: null as string | null,
    metadata: {} as Record<string, string>,
    created_at: ts,
    updated_at: ts,
    event_ts: chDate(new Date(RUN)),
    is_deleted: 0,
  };
  const scoreCases: Array<{
    id: string;
    data_type: string;
    name: string;
    value: number;
    string_value: string | null;
    long_string_value: string;
    expect: { value: number; string_value: string | null; long: string };
  }> = [
    { id: `mut-score-num-${RUN}`, data_type: "NUMERIC", name: "n", value: 0.42, string_value: null, long_string_value: "", expect: { value: 0.42, string_value: null, long: "" } }, // prettier-ignore
    { id: `mut-score-bool-${RUN}`, data_type: "BOOLEAN", name: "b", value: 1, string_value: "True", long_string_value: "", expect: { value: 1, string_value: "True", long: "" } }, // prettier-ignore
    { id: `mut-score-cat-${RUN}`, data_type: "CATEGORICAL", name: "c", value: 0, string_value: "good", long_string_value: "", expect: { value: 0, string_value: "good", long: "" } }, // prettier-ignore
    { id: `mut-score-text-${RUN}`, data_type: "TEXT", name: "t", value: 0, string_value: "free text", long_string_value: "", expect: { value: 0, string_value: "free text", long: "" } }, // prettier-ignore
    { id: `mut-score-corr-${RUN}`, data_type: "CORRECTION", name: "output", value: 0, string_value: null, long_string_value: "corrected output", expect: { value: 0, string_value: null, long: "corrected output" } }, // prettier-ignore
  ];

  for (const sc of scoreCases) {
    await upsertScore({
      ...scoreBase,
      id: sc.id,
      name: sc.name,
      source: "ANNOTATION",
      data_type: sc.data_type,
      value: sc.value,
      string_value: sc.string_value,
      long_string_value: sc.long_string_value,
    });
  }
  await sleep(500);

  for (const sc of scoreCases) {
    const rows = await greptimeQuery<{
      value: number | string;
      string_value: string | null;
      long_string_value: string | null;
    }>({
      query:
        "SELECT `value`, `string_value`, `long_string_value` FROM `scores` WHERE `project_id` = ? AND `id` = ? LIMIT 1",
      params: [PROJECT, sc.id],
    });
    const r = rows[0];
    const ok =
      r !== undefined &&
      Number(r.value) === sc.expect.value &&
      (r.string_value ?? null) === sc.expect.string_value &&
      (r.long_string_value ?? "") === sc.expect.long;
    check(`score ${sc.data_type}: projection value mapping`, ok, r);
  }

  // ---------------------------------------------------------------------------
  // cleanup
  // ---------------------------------------------------------------------------
  for (const id of [TRACE_ID, REPLAY_ID]) {
    await deleteEntityFromGreptime({
      projectId: PROJECT,
      entityType: "trace",
      entityId: id,
    });
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(async () => {
    await closeGreptimeConnections();
    await redis?.quit();
    process.exit(failures === 0 ? 0 : 1);
  });
