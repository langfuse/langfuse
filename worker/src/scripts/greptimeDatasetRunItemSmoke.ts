/**
 * Smoke test for the dataset_run_items GreptimeDB projection (04-read-path.md, GAP-DRI mini-02).
 * Run from the worker package:
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeDatasetRunItemSmoke.ts
 *
 * Exercises the real GreptimeWriter branch against the local openfuse database:
 *   1. addToQueue(DatasetRunItems) + flush -> projection row round-trips (ids, JSON metadata,
 *      input/expected_output, timestamps, dataset_item_version).
 *   2. last_non_null merge: a second write that sets `error` and clears nothing else keeps the
 *      earlier non-null fields (one row per (project_id, id)).
 *
 * Idempotent: deletes its own fixture (project_id = SMOKE_PROJECT) before and after.
 */
import {
  greptimeQuery,
  closeGreptimeConnections,
  type DatasetRunItemRecordInsertType,
} from "@langfuse/shared/src/server";
import { GreptimeWriter, GreptimeTable } from "../services/GreptimeWriter";

const SMOKE_PROJECT = "smoke-dri-project-0001";
const DRI_ID = "smoke-dri-1";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined && !ok ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const cleanup = async () =>
  greptimeQuery({
    query: `DELETE FROM \`dataset_run_items\` WHERE \`project_id\` = ?`,
    params: [SMOKE_PROJECT],
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const runCreatedAt = Date.UTC(2026, 5, 1, 8, 0, 0);

const baseRecord = (
  overrides: Partial<DatasetRunItemRecordInsertType> = {},
): DatasetRunItemRecordInsertType => ({
  id: DRI_ID,
  project_id: SMOKE_PROJECT,
  trace_id: "smoke-dri-trace-1",
  observation_id: "smoke-dri-obs-1",
  dataset_id: "ds-1",
  dataset_run_id: "run-1",
  dataset_item_id: "item-1",
  dataset_run_name: "run-one",
  dataset_run_description: "first run",
  dataset_run_metadata: { env: "prod", team: "search" },
  dataset_item_input: JSON.stringify({ q: "hello" }),
  dataset_item_expected_output: JSON.stringify({ a: "world" }),
  dataset_item_metadata: { difficulty: "easy" },
  is_deleted: 0,
  error: undefined,
  created_at: runCreatedAt,
  updated_at: runCreatedAt,
  event_ts: runCreatedAt,
  dataset_run_created_at: runCreatedAt,
  dataset_item_version: Date.UTC(2026, 4, 1, 0, 0, 0),
  ...overrides,
});

async function main() {
  await cleanup();
  const writer = GreptimeWriter.getInstance();

  // 1. initial write
  writer.addToQueue(GreptimeTable.DatasetRunItems, baseRecord());
  await writer.flushAll(true);
  await sleep(300);

  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `SELECT \`id\`, \`project_id\`, \`dataset_id\`, \`dataset_run_id\`, \`dataset_item_id\`,
              \`trace_id\`, \`observation_id\`, \`error\`, \`dataset_run_name\`,
              \`dataset_run_metadata\`, \`dataset_item_input\`, \`dataset_item_metadata\`,
              \`dataset_item_version\`, \`dataset_run_created_at\`, \`is_deleted\`
            FROM \`dataset_run_items\`
            WHERE \`project_id\` = ? AND \`id\` = ?`,
    params: [SMOKE_PROJECT, DRI_ID],
  });
  check("single projection row", rows.length === 1, rows.length);
  const row = rows[0] ?? {};
  check(
    "trace_id round-trips",
    row.trace_id === "smoke-dri-trace-1",
    row.trace_id,
  );
  check(
    "dataset_run_name round-trips",
    row.dataset_run_name === "run-one",
    row.dataset_run_name,
  );
  check(
    "run metadata JSON round-trips",
    JSON.stringify(row.dataset_run_metadata)?.includes("search") ?? false,
    row.dataset_run_metadata,
  );
  check(
    "item input round-trips",
    typeof row.dataset_item_input === "string" &&
      (row.dataset_item_input as string).includes("hello"),
    row.dataset_item_input,
  );
  check(
    "dataset_item_version present",
    row.dataset_item_version != null,
    row.dataset_item_version,
  );
  check("error null on create", row.error == null, row.error);

  // 2. last_non_null merge: set error only, keep the same time index -> one merged row
  writer.addToQueue(
    GreptimeTable.DatasetRunItems,
    baseRecord({
      error: "boom",
      // re-send identity + run time so the merge targets the same (project_id, id, time_index)
    }),
  );
  await writer.flushAll(true);
  await sleep(300);

  const merged = await greptimeQuery<Record<string, unknown>>({
    query: `SELECT \`error\`, \`dataset_run_name\`, \`dataset_item_id\`
            FROM \`dataset_run_items\` WHERE \`project_id\` = ? AND \`id\` = ?`,
    params: [SMOKE_PROJECT, DRI_ID],
  });
  check("still one row after merge", merged.length === 1, merged.length);
  check("error now set", merged[0]?.error === "boom", merged[0]?.error);
  check(
    "non-null fields preserved (last_non_null)",
    merged[0]?.dataset_run_name === "run-one" &&
      merged[0]?.dataset_item_id === "item-1",
    merged[0],
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
