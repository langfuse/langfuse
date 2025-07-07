import { IBackgroundMigration } from "./IBackgroundMigration";
import { clickhouseClient, logger } from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
const backgroundMigrationId = "f4b51797-e5ae-4d74-9625-05321493486e";

type MigrationState = {
  maxDate: string | undefined;
  minDate: string | undefined;
};

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

    // Check if new ClickHouse tables exists
    const tables = await clickhouseClient().query({
      query: "SHOW TABLES",
    });
    const tableNames = (await tables.json()).data as { name: string }[];
    if (
      ["traces_mt", "traces_all_amt", "traces_7d_amt", "traces_30_amt"].every(
        (table) => tableNames.some((t) => t.name === table),
      )
    ) {
      // Retry if the table does not exist as this may mean migrations are still pending
      if (attempts > 0) {
        logger.info(
          `ClickHouse tables do not exist. Expected to find traces_mt, traces_all_amt, traces_7d_amt, traces_30_amt. Retrying in 10s...`,
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
    logger.info(`Migrating traces to traces AMTs with ${JSON.stringify(args)}`);

    // @ts-ignore
    const initialMigrationState: { state: MigrationState } =
      await prisma.backgroundMigration.findUniqueOrThrow({
        where: { id: backgroundMigrationId },
        select: { state: true },
      });

    const maxDate = initialMigrationState.state?.maxDate
      ? new Date(initialMigrationState.state.maxDate)
      : new Date((args.maxDate as string) ?? new Date());
    const minDate = initialMigrationState.state?.minDate
      ? new Date(initialMigrationState.state.minDate)
      : new Date((args.minDate as string) ?? new Date("2023-05-18"));

    await prisma.backgroundMigration.update({
      where: { id: backgroundMigrationId },
      data: { state: { maxDate, minDate } },
    });

    while (!this.isAborted && !this.isFinished) {
      const queryStart = Date.now();

      // @ts-ignore
      const migrationState: { state: { maxDate: string; minDate: string } } =
        await prisma.backgroundMigration.findUniqueOrThrow({
          where: { id: backgroundMigrationId },
          select: { state: true },
        });

      const maxDate = new Date(migrationState.state.maxDate);
      const minDate = new Date(migrationState.state.minDate);

      // Get current month in YYYYMM format
      const currentMonth = maxDate.toISOString().slice(0, 7).replace("-", "");
      await clickhouseClient().exec({
        query: `
        INSERT INTO traces_mt
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
      `,
      });

      maxDate.setMonth(maxDate.getMonth() - 1);
      await prisma.backgroundMigration.update({
        where: { id: backgroundMigrationId },
        data: {
          state: {
            maxDate,
            minDate,
          },
        },
      });

      logger.info(
        `Inserted traces into traces_mt for ${currentMonth} in ${Date.now() - queryStart}ms`,
      );

      if (maxDate < minDate) {
        logger.info("No more traces to migrate. Exiting...");
        this.isFinished = true;
      }
    }

    if (this.isAborted) {
      logger.info(`Migration of traces to traces AMTs aborted.`);
      return;
    }

    logger.info(
      `Finished migration of traces to traces AMTs in ${Date.now() - start}ms`,
    );
  }

  async abort(): Promise<void> {
    logger.info(`Aborting migration of traces to traces AMTs`);
    this.isAborted = true;
  }
}

async function createBackgroundMigrationRecord(): Promise<void> {
  logger.info("Creating background migration record...");

  await prisma.backgroundMigration.create({
    data: {
      id: backgroundMigrationId,
      name: "20250704_1356_migrate_traces_to_traces_amt",
      script: "migrateTracesToTracesAMTs",
      args: {},
    },
  });
  logger.info("Background migration record created successfully");
}

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
    },
  });

  if (args.values.createRecord) {
    await createBackgroundMigrationRecord();
  }

  const migration = new MigrateTracesToTracesAMTs();
  await migration.validate(args.values);
  await migration.run(args.values);
}

// If the script is being executed directly (not imported), run the main function
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`Migration execution failed: ${error}`, error);
      process.exit(1); // Exit with an error code
    });
}
