/**
 * Smoke test for the GreptimeDB streaming read primitives (04-read-path.md, P0b).
 * Run from the worker package:
 *   pnpm exec dotenv -e ../.env -- npx tsx src/scripts/greptimeReadStreamSmoke.ts
 *
 * Seeds 3 dataset_run_items that SHARE one time index (same dataset_run_created_at) but have
 * distinct ids, then:
 *   1. greptimeQueryStream -> yields all 3 rows incrementally.
 *   2. greptimeKeysetScan (pageSize=2) -> pages across the same-timestamp tie WITHOUT skipping the
 *      row that shares the page-boundary timestamp (the bug a bare `ts > last` cursor would hit).
 *
 * Idempotent: deletes its fixture (project_id = SMOKE_PROJECT) before and after.
 */
import {
  greptimeQuery,
  greptimeQueryStream,
  greptimeKeysetScan,
  closeGreptimeConnections,
  type DatasetRunItemRecordInsertType,
} from "@langfuse/shared/src/server";
import { GreptimeWriter, GreptimeTable } from "../services/GreptimeWriter";

const SMOKE_PROJECT = "smoke-stream-project-0001";
const TS = Date.UTC(2026, 5, 1, 8, 0, 0); // one shared time index for all rows
const IDS = ["dri-a", "dri-b", "dri-c"];

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined && !ok ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const cleanup = () =>
  greptimeQuery({
    query: "DELETE FROM `dataset_run_items` WHERE `project_id` = ?",
    params: [SMOKE_PROJECT],
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const record = (id: string): DatasetRunItemRecordInsertType => ({
  id,
  project_id: SMOKE_PROJECT,
  trace_id: `t-${id}`,
  observation_id: undefined,
  dataset_id: "ds-1",
  dataset_run_id: "run-1",
  dataset_item_id: `item-${id}`,
  dataset_run_name: "run-one",
  dataset_run_description: undefined,
  dataset_run_metadata: {},
  dataset_item_input: "{}",
  dataset_item_expected_output: "{}",
  dataset_item_metadata: {},
  is_deleted: 0,
  error: undefined,
  created_at: TS,
  updated_at: TS,
  event_ts: TS,
  dataset_run_created_at: TS,
  dataset_item_version: undefined,
});

async function main() {
  await cleanup();
  const writer = GreptimeWriter.getInstance();
  for (const id of IDS)
    writer.addToQueue(GreptimeTable.DatasetRunItems, record(id));
  await writer.flushAll(true);
  await sleep(300);

  // 1. greptimeQueryStream
  const streamed: string[] = [];
  for await (const row of greptimeQueryStream<{ id: string }>({
    query:
      "SELECT `id` FROM `dataset_run_items` WHERE `project_id` = ? ORDER BY `id` ASC",
    params: [SMOKE_PROJECT],
    readOnly: true,
  })) {
    streamed.push(row.id);
  }
  check("stream yields all 3 rows", streamed.length === 3, streamed);
  check(
    "stream rows are the seeded ids",
    JSON.stringify(streamed) === JSON.stringify(IDS),
    streamed,
  );

  // 2. greptimeKeysetScan across a same-timestamp tie, pageSize=2
  const scanned: string[] = [];
  for await (const row of greptimeKeysetScan<{
    dataset_run_created_at: unknown;
    project_id: string;
    id: string;
  }>({
    cursorColumns: ["dataset_run_created_at", "project_id", "id"],
    cursorOf: (r) => [r.dataset_run_created_at as string, r.project_id, r.id],
    pageSize: 2,
    readOnly: true,
    buildPage: (seek) => ({
      query: `SELECT \`dataset_run_created_at\`, \`project_id\`, \`id\`
              FROM \`dataset_run_items\`
              WHERE \`project_id\` = :projectId ${seek ? `AND ${seek}` : ""}
              ORDER BY \`dataset_run_created_at\` ASC, \`project_id\` ASC, \`id\` ASC
              LIMIT 2`,
      params: { projectId: SMOKE_PROJECT },
    }),
  })) {
    scanned.push(row.id);
  }
  check(
    "keyset scan returns all 3 across the tie (no skip at page boundary)",
    scanned.length === 3,
    scanned,
  );
  check(
    "keyset scan order is stable + complete",
    JSON.stringify(scanned) === JSON.stringify(IDS),
    scanned,
  );
  check(
    "keyset scan has no duplicates",
    new Set(scanned).size === scanned.length,
    scanned,
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
