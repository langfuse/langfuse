/**
 * Copies every Postgres `audit_logs` row into the ClickHouse `audit_logs`
 * table, which owns the read path from this release on.
 *
 * The migration walks Postgres in (created_at, id) order and persists that
 * cursor in `background_migrations.state` after each batch, so an interrupted
 * run resumes where it stopped. Inserts are idempotent: the ClickHouse table is
 * a ReplacingMergeTree keyed on the row id, and the web dual-write produces
 * byte-equal rows, so re-inserting a row it already wrote is a no-op.
 *
 * Rows younger than the settle window are left to the dual-write. A row whose
 * created_at precedes the cursor can still be committing while the cursor
 * passes it, and a cursor-only walk would never see it; staying well behind
 * the present keeps that race out of the backfill's range.
 */

import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  convertPostgresAuditLogToClickhouse,
  logger,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { detectTableEngine } from "./utils/backfillBase";

// Hard-coded in the Prisma migration that registers this background migration.
export const BACKFILL_AUDIT_LOGS_MIGRATION_ID =
  "b1f3c7a0-6d2e-4f9b-9c41-7a8e5d2b3c60";

const LOG_PREFIX = "[Background Migration] backfillAuditLogsToClickhouse:";
const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_SETTLE_MS = 5 * 60 * 1000;

type BackfillState = {
  cursorCreatedAt?: string;
  cursorId?: string;
  processedRows?: number;
};

export default class BackfillAuditLogsToClickhouse implements IBackgroundMigration {
  private isAborted = false;

  constructor(
    private readonly migrationId: string = BACKFILL_AUDIT_LOGS_MIGRATION_ID,
  ) {}

  async validate(): Promise<{
    valid: boolean;
    invalidReason: string | undefined;
  }> {
    const engine = await detectTableEngine("audit_logs");
    if (!engine) {
      return {
        valid: false,
        invalidReason: "ClickHouse audit_logs table does not exist",
      };
    }
    return { valid: true, invalidReason: undefined };
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
    await prisma.backgroundMigration.updateMany({
      where: { id: this.migrationId },
      data: { state },
    });
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
    let processedRows = state.processedRows ?? 0;
    let cursor =
      state.cursorCreatedAt && state.cursorId
        ? { createdAt: new Date(state.cursorCreatedAt), id: state.cursorId }
        : null;

    logger.info(
      `${LOG_PREFIX} starting${cursor ? ` from cursor ${cursor.createdAt.toISOString()}/${cursor.id}` : ""}, ${processedRows} rows already copied`,
    );

    while (!this.isAborted) {
      const horizon = new Date(Date.now() - settleMs);
      const rows = await prisma.auditLog.findMany({
        where: {
          createdAt: { lte: horizon },
          ...(cursor
            ? {
                OR: [
                  { createdAt: { gt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: batchSize,
      });

      if (rows.length === 0) {
        logger.info(
          `${LOG_PREFIX} finished in ${Date.now() - start}ms, ${processedRows} rows copied up to ${horizon.toISOString()}`,
        );
        return;
      }

      await clickhouseClient().insert({
        table: "audit_logs",
        format: "JSONEachRow",
        values: rows.map(convertPostgresAuditLogToClickhouse),
        clickhouse_settings: {
          log_comment: JSON.stringify({
            surface: "worker",
            route: "background-migration.backfillAuditLogsToClickhouse",
          }),
        },
      });

      const last = rows[rows.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
      processedRows += rows.length;
      await this.saveState({
        cursorCreatedAt: last.createdAt.toISOString(),
        cursorId: last.id,
        processedRows,
      });

      logger.debug(`${LOG_PREFIX} copied ${processedRows} rows so far`);
    }

    logger.info(
      `${LOG_PREFIX} aborted after ${processedRows} rows, will resume from the saved cursor`,
    );
  }

  async abort(): Promise<void> {
    logger.info(`${LOG_PREFIX} aborting`);
    this.isAborted = true;
  }
}

async function main() {
  const migration = new BackfillAuditLogsToClickhouse();
  const validation = await migration.validate();
  if (!validation.valid) {
    throw new Error(validation.invalidReason);
  }
  await migration.run({});
  const count = await queryClickhouse<{ count: string }>({
    query: "SELECT count() AS count FROM audit_logs",
    tags: {
      surface: "worker",
      route: "background-migration.backfillAuditLogsToClickhouse",
    },
  });
  logger.info(`${LOG_PREFIX} ClickHouse now holds ${count[0]?.count} rows`);
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
