/**
 * Copies the rows of the Postgres `audit_logs` table into the ClickHouse
 * `audit_logs` table as change events, under the ids `deriveAuditLogEventId`
 * gives them.
 *
 * The migration walks Postgres in (created_at, id) order and saves that cursor
 * in `background_migrations.state` after each batch, so an interrupted run
 * resumes where it stopped. Clearing `finished_at` runs it again from the
 * saved cursor; clearing `state` as well copies every row again.
 *
 * Rows younger than the settle window are left to a later run. A row whose
 * created_at precedes the cursor can still be committing while the cursor
 * passes it, and the cursor never returns to it.
 *
 * `auditLog()` stages new rows for ClickHouse itself, with the actor's name
 * and email, which the Postgres row does not keep. `audit_logs` keeps the row
 * inserted last for an id, so the migration skips every row that is staged or
 * in ClickHouse already instead of overwriting it.
 */

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

const DEFAULT_BATCH_SIZE = 10_000;
const DEFAULT_SETTLE_MS = 5 * 60 * 1000;
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
    const batchSize =
      typeof args.batchSize === "number" && args.batchSize > 0
        ? args.batchSize
        : DEFAULT_BATCH_SIZE;
    const settleMs =
      typeof args.settleMs === "number" && args.settleMs >= 0
        ? args.settleMs
        : DEFAULT_SETTLE_MS;

    const state = await this.loadState();
    let cursor: Cursor | null =
      state.cursorCreatedAt && state.cursorId
        ? { createdAt: new Date(state.cursorCreatedAt), id: state.cursorId }
        : null;

    logger.info(
      `${LOG_PREFIX} starting${cursor ? ` from cursor ${cursor.createdAt.toISOString()}/${cursor.id}` : ""}`,
      state,
    );

    while (!this.isAborted) {
      const horizon = new Date(Date.now() - settleMs);
      const rows = await prisma.auditLog.findMany({
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

      if (rows.length === 0) {
        logger.info(
          `${LOG_PREFIX} finished in ${Date.now() - start}ms at rows created up to ${horizon.toISOString()}`,
          state,
        );
        return;
      }

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

      const last = rows[rows.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
      state.cursorCreatedAt = last.createdAt.toISOString();
      state.cursorId = last.id;
      state.copiedRows = (state.copiedRows ?? 0) + missing.length;
      state.skippedRows =
        (state.skippedRows ?? 0) + records.length - missing.length;
      state.failedRows = (state.failedRows ?? 0) + failures.length;
      await this.saveState(state);
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
    const state = migration?.state;
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
