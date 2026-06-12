/**
 * End-to-end smoke for the flipped write path (02-write-path.md, decision 2).
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeFlipSmoke.ts
 *
 * Drives the REAL IngestionService with rebuildFromHistory=true over a trace's full event history
 * fed in REVERSE order, proving:
 *   - the ClickHouse baseline read is skipped (pure raw_events replay),
 *   - deterministic sort (invariant 8) reorders events so the merge result is order-independent,
 *   - the merged projection is written to GreptimeDB (dual-write also hits ClickHouse).
 */
import { redis, clickhouseClient } from "@langfuse/shared/src/server";
import {
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

const PROJECT = "smoke-flip-project";
const TRACE_ID = `flip-trace-${Date.now()}`;

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!redis) throw new Error("redis unavailable");
  if (!prisma) throw new Error("prisma unavailable");

  const t0 = "2026-06-12T00:00:00.000Z";
  const t1 = "2026-06-12T00:00:05.000Z";

  // Full history, fed in REVERSE chronological order on purpose. No sessionId -> no session upsert.
  const events = [
    {
      id: "evt-update",
      type: "trace-create",
      timestamp: t1,
      body: {
        id: TRACE_ID,
        timestamp: t1,
        metadata: { stage: "late" },
        tags: ["b"],
      },
    },
    {
      id: "evt-create",
      type: "trace-create",
      timestamp: t0,
      body: {
        id: TRACE_ID,
        name: "flip-trace",
        timestamp: t0,
        metadata: { stage: "early" },
        tags: ["a"],
      },
    },
  ];

  const svc = new IngestionService(
    redis,
    prisma,
    ClickhouseWriter.getInstance(),
    clickhouseClient(),
    GreptimeWriter.getInstance(),
    /* rebuildFromHistory */ true,
  );

  // createdAtTimestamp = min(ingested_at); here a fixed past instant.
  await svc.mergeAndWrite(
    "trace",
    PROJECT,
    TRACE_ID,
    new Date(t0),
    events as never,
    /* forwardToEventsTable */ false,
  );

  await GreptimeWriter.getInstance().flushAll(true);
  await sleep(700);

  const row = await greptimeQuery<{ name: string; created_at: string }>({
    query:
      "SELECT `name`, `created_at` FROM `traces` WHERE `project_id` = ? AND `id` = ? LIMIT 1",
    params: [PROJECT, TRACE_ID],
  });
  check(
    "flip: trace projection written via rebuildFromHistory",
    row.length === 1,
  );
  // name only exists on the create (t0) event; deterministic sort + merge must retain it.
  check(
    "flip: name merged from earlier create regardless of input order",
    row[0]?.name === "flip-trace",
    row[0]?.name,
  );

  const meta = await greptimeQuery<{ key: string; value: string }>({
    query:
      "SELECT `key`, `value` FROM `traces_metadata` WHERE `project_id` = ? AND `entity_id` = ? AND `key` = ? LIMIT 1",
    params: [PROJECT, TRACE_ID, "stage"],
  });
  // last_non_null after deterministic replay: t1 ("late") is newest -> wins.
  check(
    "flip: metadata merged to latest (stage=late)",
    meta[0]?.value === "late",
    meta,
  );

  // -------------------------------------------------------------------------
  // tombstone: delete -> reprocess must rebuild as soft-deleted, not resurrect
  // -------------------------------------------------------------------------
  const TOMB_ID = `flip-tomb-${Date.now()}`;
  const ts = new Date(Date.now() - 60_000).toISOString(); // logical event time, 1 min ago
  const createIngestedAt = Date.now() - 1000; // ingested before the (later) tombstone
  await writeRawEvents([
    {
      projectId: PROJECT,
      entityType: "trace",
      entityId: TOMB_ID,
      eventId: "tomb-create",
      eventType: "trace-create",
      eventTs: new Date(ts).getTime(),
      ingestedAt: createIngestedAt,
      body: JSON.stringify({
        id: "tomb-create",
        type: "trace-create",
        timestamp: ts,
        body: { id: TOMB_ID, name: "to-delete", timestamp: ts },
      }),
    },
  ]);
  // delete -> appends a tombstone to raw_events (+ deletes any projection rows)
  await deleteEntityFromGreptime({
    projectId: PROJECT,
    entityType: "trace",
    entityId: TOMB_ID,
  });

  const tombHist = parseRawEventHistory(
    await readRawEventsForEntity({
      projectId: PROJECT,
      entityType: "trace",
      entityId: TOMB_ID,
    }),
  );
  check("tombstone: parse flags entity deleted", tombHist.deleted === true);
  check(
    "tombstone: live create still in history",
    tombHist.events.length === 1,
    tombHist.events.length,
  );

  // reprocess (as the worker would) — must rebuild soft-deleted
  await svc.mergeAndWrite(
    "trace",
    PROJECT,
    TOMB_ID,
    new Date(ts),
    tombHist.events as never,
    false,
    tombHist.deleted,
  );
  await GreptimeWriter.getInstance().flushAll(true);
  await sleep(500);

  const tombRow = await greptimeQuery<{ is_deleted: number | boolean }>({
    query:
      "SELECT `is_deleted` FROM `traces` WHERE `project_id` = ? AND `id` = ? LIMIT 1",
    params: [PROJECT, TOMB_ID],
  });
  check(
    "tombstone: reprocess rebuilds is_deleted=true (no live resurrection)",
    tombRow.length === 1 &&
      (tombRow[0].is_deleted === true || Number(tombRow[0].is_deleted) === 1),
    tombRow[0]?.is_deleted,
  );

  // cleanup projection + EAV (raw_events untouched: append-only)
  for (const tbl of ["traces", "traces_metadata", "traces_tags"]) {
    await greptimeQuery({
      query: `DELETE FROM \`${tbl}\` WHERE \`project_id\` = ?`,
      params: [PROJECT],
    });
  }

  await GreptimeWriter.getInstance().shutdown();
  await closeGreptimeConnections();
  await redis.quit().catch(() => {});

  console.log(
    `\n${failures === 0 ? "FLIP SMOKE PASSED" : `${failures} FLIP CHECK(S) FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("flip smoke crashed", e);
  process.exit(1);
});
