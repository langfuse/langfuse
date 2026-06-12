/**
 * Live smoke for the GreptimeDB EAV semi-join filter (04-read-path.md, P0b).
 * Run from the worker package:
 *   pnpm exec dotenv -e ../.env -- npx tsx src/scripts/greptimeFilterSmoke.ts
 *
 * Proves tenant isolation: two projects hold the SAME trace id with DIFFERENT metadata. A
 * project-scoped metadata EXISTS filter must only ever match within its own project — the exact
 * cross-project id collision a non-project-scoped subquery would leak.
 *
 * Idempotent: deletes both project fixtures before and after.
 */
import {
  greptimeQuery,
  greptimeFilters,
  closeGreptimeConnections,
  type TraceRecordInsertType,
} from "@langfuse/shared/src/server";
import { GreptimeWriter, GreptimeTable } from "../services/GreptimeWriter";

const PROJECT_A = "smoke-filter-A";
const PROJECT_B = "smoke-filter-B";
const SHARED_ID = "shared-trace-id";
const TS = Date.UTC(2026, 5, 1, 8, 0, 0);

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined && !ok ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cleanup = async () => {
  for (const p of [PROJECT_A, PROJECT_B]) {
    for (const t of ["traces", "traces_metadata", "traces_tags"]) {
      await greptimeQuery({
        query: `DELETE FROM \`${t}\` WHERE \`project_id\` = ?`,
        params: [p],
      });
    }
  }
};

const trace = (projectId: string, env: string): TraceRecordInsertType =>
  ({
    id: SHARED_ID,
    project_id: projectId,
    timestamp: TS,
    name: "t",
    environment: "default",
    metadata: { env },
    tags: ["x"],
    created_at: TS,
    updated_at: TS,
    is_deleted: 0,
  }) as unknown as TraceRecordInsertType;

/** Count traces in `project` matching the metadata filter for `key=value`. */
const countMatching = async (
  project: string,
  key: string,
  value: string,
): Promise<number> => {
  const f = new greptimeFilters.StringObjectFilter({
    table: "traces",
    field: "metadata",
    operator: "=",
    key,
    value,
    tablePrefix: "t",
  }).apply();
  const rows = await greptimeQuery<{ id: string }>({
    query: `SELECT t.\`id\` FROM \`traces\` t
            WHERE t.\`project_id\` = :projectId AND ${f.query}`,
    params: { projectId: project, ...f.params },
    readOnly: true,
  });
  return rows.length;
};

async function main() {
  await cleanup();
  const writer = GreptimeWriter.getInstance();
  writer.addToQueue(GreptimeTable.Traces, trace(PROJECT_A, "prod"));
  writer.addToQueue(GreptimeTable.Traces, trace(PROJECT_B, "staging"));
  await writer.flushAll(true);
  await sleep(300);

  check(
    "A matches its own env=prod",
    (await countMatching(PROJECT_A, "env", "prod")) === 1,
  );
  check(
    "A does NOT match B's env=staging (no cross-project leak)",
    (await countMatching(PROJECT_A, "env", "staging")) === 0,
  );
  check(
    "B matches its own env=staging",
    (await countMatching(PROJECT_B, "env", "staging")) === 1,
  );
  check(
    "B does NOT match A's env=prod (no cross-project leak)",
    (await countMatching(PROJECT_B, "env", "prod")) === 0,
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
