/**
 * Copies the rows of the Postgres `audit_logs` table into the ClickHouse
 * `audit_logs` table as change events, under the ids `deriveAuditLogEventId`
 * gives them.
 *
 * The migration walks Postgres in (created_at, id) order and saves that cursor
 * in `background_migrations.state` after each batch, so an interrupted run
 * resumes where it stopped.
 *
 * It copies the rows created up to `copyUntil` and leaves later rows to
 * staging. The first run sets `copyUntil` to the oldest change event in
 * ClickHouse, or to its own start if there is none, plus `args.overlapMs`.
 * Web tasks of a version that does not stage yet write unstaged rows until a
 * rolling upgrade replaces them, and the overlap covers those rows. To copy
 * later rows, set `state.copyUntil` to a later time and clear `finished_at`;
 * clearing `state` copies every row again.
 *
 * The migration finishes once the rows up to `copyUntil` are older than the
 * settle window and copied, and waits until then. A row whose created_at
 * precedes the cursor can still be committing while the cursor passes it, and
 * the cursor never returns to it.
 *
 * `auditLog()` stages new rows for ClickHouse itself, with the actor's name
 * and email, which the Postgres row does not keep. `audit_logs` keeps the row
 * inserted last for an id, so the migration skips every row that is staged or
 * in ClickHouse already instead of overwriting it.
 */

import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "@langfuse/shared/src/db";
import {
  convertDateToClickhouseDateTime,
  convertPostgresAuditLogToClickhouse,
  logger,
  queryClickhouse,
  type AuditLogRecordInsertType,
} from "@langfuse/shared/src/server";
import { insertAuditLogRecords } from "../features/audit-log-relay";
import { IBackgroundMigration } from "./IBackgroundMigration";
import { detectTableEngine } from "./utils/backfillBase";

// Hard-coded in the Prisma migration that registers this background migration.
const BACKFILL_AUDIT_LOGS_MIGRATION_ID = "e70a9ca9-ad90-4419-a86e-4f4e2a4b7fa2";

const LOG_PREFIX = "[Background Migration] backfillAuditLogsToClickhouse:";
const CLICKHOUSE_TAGS = {
  surface: "worker",
  route: "background-migration.backfillAuditLogsToClickhouse",
};

// A batch holds its rows' before/after payloads in memory several times over:
// in Prisma's engine, as mapped records and as the insert body.
const DEFAULT_BATCH_SIZE = 1_000;
const DEFAULT_SETTLE_MS = 5 * 60 * 1000;
const DEFAULT_OVERLAP_MS = 10 * 60 * 1000;
// Bounds how long an abort waits while the migration waits for copyUntil.
const MAX_WAIT_MS = 10 * 1000;
const INSERT_TIMEOUT_MS = 5 * 60 * 1000;
const LOGGED_FAILURES_MAX = 10;

const POSTGRES_AUDIT_LOG_SELECT = {
  id: true,
  createdAt: true,
  type: true,
  userId: true,
  apiKeyId: true,
  userOrgRole: true,
  userProjectRole: true,
  orgId: true,
  projectId: true,
  resourceType: true,
  resourceId: true,
  action: true,
  before: true,
  after: true,
} as const;

type BackfillState = {
  // The migration copies the rows created up to this time. Set on the first
  // run.
  copyUntil?: string;
  cursorCreatedAt?: string;
  cursorId?: string;
  // Rows inserted into ClickHouse.
  copiedRows?: number;
  // Rows that were staged or in ClickHouse already.
  skippedRows?: number;
  // Rows that could not be mapped. Their ids are logged.
  failedRows?: number;
};

type Cursor = { createdAt: Date; id: string };

type BatchCounts = { copied: number; skipped: number; failed: number };

type PostgresAuditLogRow = Parameters<
  typeof convertPostgresAuditLogToClickhouse
>[0];

export default class BackfillAuditLogsToClickhouse implements IBackgroundMigration {
  private isAborted = false;

  constructor(
    private readonly migrationId: string = BACKFILL_AUDIT_LOGS_MIGRATION_ID,
  ) {}

  async validate(): Promise<{
    valid: boolean;
    invalidReason: string | undefined;
  }> {
    if (!(await detectTableEngine("audit_logs"))) {
      return {
        valid: false,
        invalidReason: "ClickHouse audit_logs table does not exist",
      };
    }
    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    const { batchSize, settleMs, overlapMs } = parseArgs(args);
    const loaded = await this.loadState();
    // Read before the first batch adds older rows to ClickHouse.
    const copyUntilIso = loaded.copyUntil ?? (await findCopyUntil(overlapMs));
    let state: BackfillState = { ...loaded, copyUntil: copyUntilIso };
    await this.saveState(state);
    const copyUntil = new Date(copyUntilIso);
    logger.info(
      `${LOG_PREFIX} starting${describeCursor(state)}, copying rows created up to ${copyUntilIso}`,
      state,
    );

    while (!this.isAborted) {
      const settled = new Date(Date.now() - settleMs);
      const horizon = settled < copyUntil ? settled : copyUntil;
      const rows = await fetchSettledBatch(toCursor(state), horizon, batchSize);
      if (rows.length > 0) {
        const counts = await copyBatch(rows);
        state = advanceState(state, rows[rows.length - 1], counts);
        await this.saveState(state);
      } else if (settled >= copyUntil) {
        logger.info(`${LOG_PREFIX} finished in ${Date.now() - start}ms`, state);
        return;
      } else {
        await sleep(
          Math.min(copyUntil.getTime() - settled.getTime(), MAX_WAIT_MS),
        );
      }
    }

    logger.info(
      `${LOG_PREFIX} aborted, will resume from the saved cursor`,
      state,
    );
  }

  async abort(): Promise<void> {
    logger.info(`${LOG_PREFIX} aborting`);
    this.isAborted = true;
  }

  private async loadState(): Promise<BackfillState> {
    const migration = await prisma.backgroundMigration.findUnique({
      where: { id: this.migrationId },
      select: { state: true },
    });
    if (!migration) {
      throw new Error(
        `${LOG_PREFIX} no background_migrations row has the id ${this.migrationId}. Insert it with the SQL of the Prisma migration that registers this background migration.`,
      );
    }
    const { state } = migration;
    return state && typeof state === "object" && !Array.isArray(state)
      ? (state as BackfillState)
      : {};
  }

  private async saveState(state: BackfillState): Promise<void> {
    await prisma.backgroundMigration.update({
      where: { id: this.migrationId },
      data: { state },
    });
  }
}

function parseArgs(args: Record<string, unknown>): {
  batchSize: number;
  settleMs: number;
  overlapMs: number;
} {
  return {
    batchSize:
      typeof args.batchSize === "number" && args.batchSize > 0
        ? args.batchSize
        : DEFAULT_BATCH_SIZE,
    settleMs:
      typeof args.settleMs === "number" && args.settleMs >= 0
        ? args.settleMs
        : DEFAULT_SETTLE_MS,
    overlapMs:
      typeof args.overlapMs === "number" && args.overlapMs >= 0
        ? args.overlapMs
        : DEFAULT_OVERLAP_MS,
  };
}

/**
 * The oldest change event in ClickHouse, or now if there is none, plus
 * `overlapMs`, as an ISO string.
 */
async function findCopyUntil(overlapMs: number): Promise<string> {
  const [row] = await queryClickhouse<{ oldest: string | number | null }>({
    query: `
      SELECT toUnixTimestamp64Milli(minOrNull(timestamp)) AS oldest
      FROM audit_logs
      WHERE event_kind = 'change'
    `,
    tags: CLICKHOUSE_TAGS,
  });
  const now = Date.now();
  const oldest = row?.oldest == null ? now : Math.min(Number(row.oldest), now);
  return new Date(oldest + overlapMs).toISOString();
}

function toCursor(state: BackfillState): Cursor | null {
  return state.cursorCreatedAt && state.cursorId
    ? { createdAt: new Date(state.cursorCreatedAt), id: state.cursorId }
    : null;
}

function describeCursor(state: BackfillState): string {
  return state.cursorCreatedAt && state.cursorId
    ? ` from cursor ${state.cursorCreatedAt}/${state.cursorId}`
    : "";
}

/** The next rows after `cursor` in (created_at, id) order, up to `horizon`. */
function fetchSettledBatch(
  cursor: Cursor | null,
  horizon: Date,
  batchSize: number,
): Promise<PostgresAuditLogRow[]> {
  return prisma.auditLog.findMany({
    select: POSTGRES_AUDIT_LOG_SELECT,
    where: {
      // The range on created_at alone lets Postgres use its index.
      createdAt: { gte: cursor?.createdAt, lte: horizon },
      ...(cursor
        ? {
            OR: [
              { createdAt: { gt: cursor.createdAt } },
              { id: { gt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: batchSize,
  });
}

/** Inserts the rows that are neither staged nor in ClickHouse yet. */
async function copyBatch(rows: PostgresAuditLogRow[]): Promise<BatchCounts> {
  const { records, failures } = mapRows(rows);
  const writtenIds = await findWrittenIds(
    records,
    rows[0].createdAt,
    rows[rows.length - 1].createdAt,
  );
  const missing = records.filter((record) => !writtenIds.has(record.id));
  if (missing.length > 0) {
    await insertAuditLogRecords(
      missing,
      AbortSignal.timeout(INSERT_TIMEOUT_MS),
    );
  }
  if (failures.length > 0) {
    logger.error(
      `${LOG_PREFIX} ${failures.length} rows could not be mapped and were not copied`,
      { failures: failures.slice(0, LOGGED_FAILURES_MAX) },
    );
  }
  return {
    copied: missing.length,
    skipped: records.length - missing.length,
    failed: failures.length,
  };
}

function advanceState(
  state: BackfillState,
  last: PostgresAuditLogRow,
  counts: BatchCounts,
): BackfillState {
  return {
    ...state,
    cursorCreatedAt: last.createdAt.toISOString(),
    cursorId: last.id,
    copiedRows: (state.copiedRows ?? 0) + counts.copied,
    skippedRows: (state.skippedRows ?? 0) + counts.skipped,
    failedRows: (state.failedRows ?? 0) + counts.failed,
  };
}

function mapRows(rows: PostgresAuditLogRow[]): {
  records: AuditLogRecordInsertType[];
  failures: { id: string; error: string }[];
} {
  const records: AuditLogRecordInsertType[] = [];
  const failures: { id: string; error: string }[] = [];
  for (const row of rows) {
    try {
      records.push(convertPostgresAuditLogToClickhouse(row));
    } catch (error) {
      failures.push({
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { records, failures };
}

/**
 * Returns the ids of the records that are staged or in ClickHouse already.
 * Staging is read first: the relay inserts a row into ClickHouse before it
 * deletes it from staging, so a row relayed between the two reads is found
 * in ClickHouse.
 */
async function findWrittenIds(
  records: AuditLogRecordInsertType[],
  from: Date,
  to: Date,
): Promise<Set<string>> {
  if (records.length === 0) return new Set();

  const staged = await prisma.auditLogStaging.findMany({
    where: { id: { in: records.map((record) => record.id) } },
    select: { id: true },
  });
  const inClickhouse = await queryClickhouse<{ id: string }>({
    query: `
      SELECT DISTINCT id
      FROM audit_logs
      WHERE org_id IN {orgIds: Array(String)}
        AND timestamp >= {from: DateTime64(3)}
        AND timestamp <= {to: DateTime64(3)}
        AND event_kind = 'change'
    `,
    params: {
      orgIds: Array.from(new Set(records.map((record) => record.org_id))),
      from: convertDateToClickhouseDateTime(from),
      to: convertDateToClickhouseDateTime(to),
    },
    tags: CLICKHOUSE_TAGS,
  });

  return new Set([...staged, ...inClickhouse].map((row) => row.id));
}

async function main() {
  const migration = new BackfillAuditLogsToClickhouse();
  const validation = await migration.validate();
  if (!validation.valid) {
    throw new Error(validation.invalidReason);
  }
  await migration.run({});
}

// If the script is being executed directly (not imported), run the main function
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`Migration execution failed: ${error}`, error);
      process.exit(1);
    });
}
