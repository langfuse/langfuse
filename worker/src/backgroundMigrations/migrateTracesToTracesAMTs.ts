import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  ClickhouseClientType,
  logger,
} from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";
import { randomUUID } from "node:crypto";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
const backgroundMigrationId = "f4b51797-e5ae-4d74-9625-05321493486e";

type MigrationState = {
  maxDate: string | undefined;
  minDate: string | undefined;
  queryTimeoutMinutes: number | undefined;
  targetTracesAllAmtOnly: boolean | undefined;
};

/**
 * Checks if a query exists in the system.query_log table
 */
async function checkQueryExists(
  client: ClickhouseClientType,
  queryId: string,
): Promise<boolean> {
  const queryLogTable =
    env.CLICKHOUSE_CLUSTER_ENABLED === "true"
      ? `clusterAllReplicas(${env.CLICKHOUSE_CLUSTER_NAME}, system.query_log)`
      : "system.query_log";

  const resultSet = await client.query({
    query: `
      SELECT COUNT(*) > 0 AS exists
      FROM ${queryLogTable}
      WHERE query_id = '${queryId}'
      ${env.CLICKHOUSE_CLUSTER_ENABLED === "true" ? " SETTINGS skip_unavailable_shards = 1 " : ""}
    `,
    format: "JSONEachRow",
  });
  const result = (await resultSet.json()) as { exists: 0 | 1 }[];
  return result.length > 0 && result[0].exists !== 0;
}

/**
 * Checks if a query has completed successfully
 */
async function checkCompletedQuery(
  client: ClickhouseClientType,
  queryId: string,
): Promise<boolean> {
  const queryLogTable =
    env.CLICKHOUSE_CLUSTER_ENABLED === "true"
      ? `clusterAllReplicas(${env.CLICKHOUSE_CLUSTER_NAME}, system.query_log)`
      : "system.query_log";

  const resultSet = await client.query({
    query: `
      SELECT type, exception
      FROM ${queryLogTable}
      WHERE query_id = '${queryId}' AND type != 'QueryStart'
      LIMIT 1
      ${env.CLICKHOUSE_CLUSTER_ENABLED === "true" ? " SETTINGS skip_unavailable_shards = 1 " : ""}
    `,
    format: "JSONEachRow",
  });
  const result = (await resultSet.json()) as {
    type: string;
    exception: string | undefined;
  }[];
  if (result.length > 0 && result[0].type !== "QueryFinish") {
    throw new Error(
      `Query ${queryId} failed with ${result[0].type}: ${result[0].exception}`,
    );
  }
  return result.length > 0;
}

/**
 * Executes a long-running ClickHouse query with timeout and progress monitoring
 * Based on: https://github.com/ClickHouse/clickhouse-js/blob/main/examples/long_running_queries_timeouts.ts#L85
 */
async function executeLongRunningQuery(
  query: string,
  timeoutMinutes: number,
): Promise<void> {
  const queryId = randomUUID();
  const client = clickhouseClient();

  const abortController = new AbortController();
  const timeoutMs = timeoutMinutes * 60 * 1000;

  logger.info(`[Background Migration] Executing backfill query ${queryId}`);

  // Start the query execution
  const queryPromise = client.command({
    query,
    query_id: queryId,
    abort_signal: abortController.signal,
  });

  const startTime = Date.now();

  // Check whether the query was created
  let checkExistTries = 0;
  await new Promise<void>((resolve, reject) => {
    const checkInterval = setInterval(async () => {
      const queryExists = await checkQueryExists(client, queryId);
      if (queryExists) {
        clearInterval(checkInterval);
        resolve();
      }
      // We rather use lots of tries, but a low interval to ensure that this completes quickly.
      // Since the query should be cheap, we're not worried too much about the load.
      if (checkExistTries++ > 60) {
        clearInterval(checkInterval);
        reject(
          new Error(
            `Query ${queryId} does not exist in system.query_log after ${
              checkExistTries * 2
            }s`,
          ),
        );
      }
    }, 2000);
  });

  // Cancel the HTTP request and keep it running server-side only.
  abortController.abort();

  // Handle the expected abort error when canceling the HTTP request
  try {
    await queryPromise;
  } catch (err) {
    if (err instanceof Error && err.message.includes("abort")) {
      logger.info(
        `[Background Migration] Query ${queryId} HTTP request aborted as expected, query continues server-side`,
      );
    } else {
      throw err;
    }
  }

  // Check whether the query completed or aborted after timeoutMin minutes
  await new Promise<void>((resolve, reject) => {
    const checkInterval = setInterval(async () => {
      try {
        const isCompleted = await checkCompletedQuery(client, queryId);
        if (isCompleted) {
          clearInterval(checkInterval);
          resolve();
        }
      } catch (err) {
        clearInterval(checkInterval);
        reject(err);
      }

      // If Date.now() - startTime rounded down to a second is a multiple of 60, print a log message, i.e. ~ every minute
      if (Math.floor((Date.now() - startTime) / 1000) % 60 === 0) {
        logger.info(
          `[Background Migration] Query ${queryId} still running after ${Math.floor(
            (Date.now() - startTime) / 60000,
          )} minutes`,
        );
      }

      if (Date.now() - startTime > timeoutMs) {
        logger.warn(
          `[Background Migration] Query ${queryId} still running after ${timeoutMinutes} minutes. Aborting...`,
        );
        await client.command({
          query: `KILL QUERY WHERE query_id = '${queryId}'`,
        });
        clearInterval(checkInterval);
        reject(
          new Error(
            `Query ${queryId} cancelled after ${timeoutMinutes} minutes`,
          ),
        );
      }
    }, 1000);
  });

  logger.info(`[Background Migration] Query ${queryId} completed successfully`);
}

export default class MigrateTracesToTracesAMTs implements IBackgroundMigration {
  private isAborted = false;
  private isFinished = false;

  async validate(
    args: Record<string, unknown>,
    attempts = 5,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    // Check if Clickhouse credentials are configured
    if (
      !env.CLICKHOUSE_URL ||
      !env.CLICKHOUSE_USER ||
      !env.CLICKHOUSE_PASSWORD
    ) {
      return {
        valid: false,
        invalidReason:
          "Clickhouse credentials must be configured to perform migration",
      };
    }

    // Check if required ClickHouse tables exist
    const tables = await clickhouseClient().query({
      query: "SHOW TABLES",
    });
    const tableNames = (await tables.json()).data as { name: string }[];
    if (
      ["traces_null", "traces_all_amt", "traces_7d_amt", "traces_30_amt"].every(
        (table) => tableNames.some((t) => t.name === table),
      )
    ) {
      // Retry if the table does not exist as this may mean migrations are still pending
      if (attempts > 0) {
        logger.info(
          `[Background Migration] ClickHouse tables do not exist. Expected to find traces_null, traces_all_amt, traces_7d_amt, traces_30_amt. Retrying in 10s...`,
        );
        return new Promise((resolve) => {
          setTimeout(() => resolve(this.validate(args, attempts - 1)), 10_000);
        });
      }
    }

    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    logger.info(
      `[Background Migration] Migrating traces to traces AMTs with ${JSON.stringify(args)}`,
    );

    // @ts-ignore
    const initialMigrationState: { state: MigrationState } =
      await prisma.backgroundMigration.findUniqueOrThrow({
        where: { id: backgroundMigrationId },
        select: { state: true },
      });

    // Use values from database state if available, otherwise fall back to args
    const queryTimeoutMinutes =
      initialMigrationState.state?.queryTimeoutMinutes ??
      (args.queryTimeoutMinutes as number | undefined);
    const targetTracesAllAmtOnly =
      initialMigrationState.state?.targetTracesAllAmtOnly ??
      (args.targetTracesAllAmtOnly as boolean | undefined) ??
      false;

    const maxDate = initialMigrationState.state?.maxDate
      ? new Date(initialMigrationState.state.maxDate)
      : new Date((args.maxDate as string) ?? new Date());
    const minDate = initialMigrationState.state?.minDate
      ? new Date(initialMigrationState.state.minDate)
      : new Date((args.minDate as string) ?? new Date("2023-05-18"));

    await prisma.backgroundMigration.update({
      where: { id: backgroundMigrationId },
      data: {
        state: {
          maxDate,
          minDate,
          queryTimeoutMinutes,
          targetTracesAllAmtOnly,
        },
      },
    });

    while (!this.isAborted && !this.isFinished) {
      const queryStart = Date.now();

      // @ts-ignore
      const migrationState: {
        state: {
          maxDate: string;
          minDate: string;
          targetTracesAllAmtOnly?: boolean;
        };
      } = await prisma.backgroundMigration.findUniqueOrThrow({
        where: { id: backgroundMigrationId },
        select: { state: true },
      });

      const maxDate = new Date(migrationState.state.maxDate);
      const minDate = new Date(migrationState.state.minDate);
      const targetTracesAllAmtOnly =
        migrationState.state.targetTracesAllAmtOnly ?? false;

      // Get current month in YYYYMM format
      const currentMonth = maxDate.toISOString().slice(0, 7).replace("-", "");
      logger.info(
        `[Background Migration] Migrating traces for ${currentMonth}`,
      );

      const targetTable = targetTracesAllAmtOnly
        ? "traces_all_amt"
        : "traces_null";

      const query = targetTracesAllAmtOnly
        ? `
          INSERT INTO ${targetTable}
          SELECT
            -- Identifiers
            project_id,
            id,
            t.timestamp as timestamp,
            t.timestamp as start_time,
            t.timestamp as end_time,
            name,

            -- Metadata properties
            metadata,
            user_id,
            session_id,
            environment,
            tags,
            version,
            release,

            -- UI Properties
            arrayReduce('argMaxState', [toNullable(bookmarked)], [event_ts]) as bookmarked,
            arrayReduce('argMaxState', [toNullable(public)], [event_ts]) as public,

            -- Aggregations
            [] as observation_ids,
            [] as score_ids,
            map() as cost_details,
            map() as usage_details,

            -- Input/Output
            arrayReduce('argMaxState', [coalesce(input, '')], [if(coalesce(input, '') <> '', event_ts, toDateTime64(0, 3))]) as input,
            arrayReduce('argMaxState', [coalesce(output, '')], [if(coalesce(output, '') <> '', event_ts, toDateTime64(0, 3))]) as output,

            created_at,
            updated_at
          FROM traces t
          WHERE toYYYYMM(t.timestamp) = ${currentMonth}
        `
        : `
          INSERT INTO ${targetTable}
          SELECT
            -- Identifiers
            project_id,
            id,
            timestamp as start_time,
            null as end_time,
            name,

            -- Metadata properties
            metadata,
            user_id,
            session_id,
            environment,
            tags,
            version,
            release,

            -- UI Properties
            bookmarked,
            public,

            -- Aggregations (ignored)
            [] as observation_ids,
            [] as score_ids,
            map() as cost_details,
            map() as usage_details,

            -- Input/Output
            input,
            output,

            created_at,
            updated_at,
            event_ts
          FROM traces
          WHERE toYYYYMM(timestamp) = ${currentMonth}
        `;

      await executeLongRunningQuery(query, queryTimeoutMinutes ?? 90);

      maxDate.setMonth(maxDate.getMonth() - 1);
      await prisma.backgroundMigration.update({
        where: { id: backgroundMigrationId },
        data: {
          state: {
            ...migrationState.state,
            maxDate,
          },
        },
      });

      logger.info(
        `[Background Migration] Inserted traces into ${targetTable} for ${currentMonth} in ${Date.now() - queryStart}ms`,
      );

      if (maxDate < minDate) {
        logger.info(
          "[Background Migration] No more traces to migrate. Exiting...",
        );
        this.isFinished = true;
      }
    }

    if (this.isAborted) {
      logger.info(
        `[Background Migration] Migration of traces to traces AMTs aborted.`,
      );
      return;
    }

    logger.info(
      `[Background Migration] Finished migration of traces to traces AMTs in ${Date.now() - start}ms`,
    );
  }

  async abort(): Promise<void> {
    logger.info(
      `[Background Migration] Aborting migration of traces to traces AMTs`,
    );
    this.isAborted = true;
  }
}

async function createBackgroundMigrationRecord(): Promise<void> {
  logger.info("[Background Migration] Creating background migration record...");

  await prisma.backgroundMigration.create({
    data: {
      id: backgroundMigrationId,
      name: "20250704_1356_migrate_traces_to_traces_amt",
      script: "migrateTracesToTracesAMTs",
      args: {},
    },
  });
  logger.info(
    "[Background Migration] Background migration record created successfully",
  );
}

// TODO: Confirm defaults for maxDate and minDate to ensure coverage for self-hosters
async function main() {
  const args = parseArgs({
    options: {
      maxDate: {
        type: "string",
        short: "d",
        default: new Date().toISOString(),
      },
      minDate: {
        type: "string",
        short: "m",
        default: new Date("2023-05-18T00:00:00.000Z").toISOString(),
      },
      createRecord: {
        type: "boolean",
        short: "c",
        default: false,
      },
      timeoutMinutes: {
        type: "string",
        short: "t",
        default: "90",
      },
      targetTracesAllAmtOnly: {
        type: "boolean",
        default: false,
      },
    },
  });

  if (args.values.createRecord) {
    await createBackgroundMigrationRecord();
  }

  // Convert string args to numbers
  const migrationArgs = {
    ...args.values,
    queryTimeoutMinutes: parseInt(args.values.timeoutMinutes!),
  };

  const migration = new MigrateTracesToTracesAMTs();
  await migration.validate(migrationArgs);
  await migration.run(migrationArgs);
}

// If the script is being executed directly (not imported), run the main function
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(
        `[Background Migration] Migration execution failed: ${error}`,
        error,
      );
      process.exit(1); // Exit with an error code
    });
}
