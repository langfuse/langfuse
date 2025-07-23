import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  convertPostgresDatasetRunItemToInsert,
  logger,
} from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
const backgroundMigrationId = "8d47f91b-3e5c-4a26-9f85-c12d6e4b9a3d";

export default class MigrateDatasetRunItemsFromPostgresToClickhouse
  implements IBackgroundMigration
{
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

    // Check if ClickHouse dataset_run_items table exists
    const tables = await clickhouseClient().query({
      query: "SHOW TABLES",
    });
    const tableNames = (await tables.json()).data as { name: string }[];
    if (!tableNames.some((r) => r.name === "dataset_run_items")) {
      // Retry if the table does not exist as this may mean migrations are still pending
      if (attempts > 0) {
        logger.info(
          `ClickHouse dataset_run_items table does not exist. Retrying in 10s...`,
        );
        return new Promise((resolve) => {
          setTimeout(() => resolve(this.validate(args, attempts - 1)), 10_000);
        });
      }

      // If all retries are exhausted, return as invalid
      return {
        valid: false,
        invalidReason: "ClickHouse dataset_run_items table does not exist",
      };
    }

    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    logger.info(
      `Migrating dataset_run_items from postgres to clickhouse with ${JSON.stringify(args)}`,
    );

    // @ts-ignore
    const initialMigrationState: { state: { maxDate: string | undefined } } =
      await prisma.backgroundMigration.findUniqueOrThrow({
        where: { id: backgroundMigrationId },
        select: { state: true },
      });

    const maxRowsToProcess = Number(args.maxRowsToProcess ?? Infinity);
    const batchSize = Number(args.batchSize ?? 1000);
    const maxDate = initialMigrationState.state?.maxDate
      ? new Date(initialMigrationState.state.maxDate)
      : new Date((args.maxDate as string) ?? new Date());

    await prisma.backgroundMigration.update({
      where: { id: backgroundMigrationId },
      data: { state: { maxDate } },
    });

    let processedRows = 0;
    while (
      !this.isAborted &&
      !this.isFinished &&
      processedRows < maxRowsToProcess
    ) {
      const fetchStart = Date.now();

      // @ts-ignore
      const migrationState: { state: { maxDate: string } } =
        await prisma.backgroundMigration.findUniqueOrThrow({
          where: { id: backgroundMigrationId },
          select: { state: true },
        });

      const datasetRunItems = await prisma.$queryRaw<
        Array<Record<string, any>>
      >(Prisma.sql`
        SELECT 
          dri.id as id,
          dri.project_id as project_id,
          dri.dataset_run_id as dataset_run_id,
          dri.dataset_item_id as dataset_item_id, 
          dri.trace_id as trace_id,
          dri.observation_id as observation_id,
          dri.created_at as created_at,
          dri.updated_at as updated_at,
          
          -- Denormalized dataset run fields
          dr.name as dataset_run_name,
          dr.description as dataset_run_description,
          dr.metadata as dataset_run_metadata,
          dr.created_at as dataset_run_created_at,
          
          -- Denormalized dataset item fields  
          di.input as dataset_item_input,
          di.expected_output as dataset_item_expected_output,
          di.metadata as dataset_item_metadata,
          
          -- Dataset ID
          d.id as dataset_id

        FROM dataset_run_items dri
        JOIN dataset_runs dr ON dri.dataset_run_id = dr.id
        JOIN dataset_items di ON dri.dataset_item_id = di.id  
        JOIN datasets d ON di.dataset_id = d.id
        WHERE dri.created_at <= ${new Date(migrationState.state.maxDate)}
        ORDER BY dri.created_at DESC
        LIMIT ${batchSize};
      `);
      if (datasetRunItems.length === 0) {
        logger.info("No more dataset_run_items to migrate. Exiting...");
        break;
      }

      logger.info(
        `Got ${datasetRunItems.length} records from Postgres in ${Date.now() - fetchStart}ms`,
      );

      const insertStart = Date.now();
      await clickhouseClient().insert({
        table: "dataset_run_items",
        values: datasetRunItems.map(convertPostgresDatasetRunItemToInsert),
        format: "JSONEachRow",
      });

      logger.info(
        `Inserted ${datasetRunItems.length} dataset_run_items into Clickhouse in ${Date.now() - insertStart}ms`,
      );

      await prisma.backgroundMigration.update({
        where: { id: backgroundMigrationId },
        data: {
          state: {
            maxDate: new Date(
              datasetRunItems[datasetRunItems.length - 1].created_at,
            ),
          },
        },
      });

      if (datasetRunItems.length < batchSize) {
        logger.info("No more dataset_run_items to migrate. Exiting...");
        this.isFinished = true;
      }

      processedRows += datasetRunItems.length;
      logger.info(
        `Processed batch in ${Date.now() - fetchStart}ms. Oldest record in batch: ${new Date(datasetRunItems[datasetRunItems.length - 1].created_at).toISOString()}`,
      );
    }

    if (this.isAborted) {
      logger.info(
        `Migration of traces from Postgres to Clickhouse aborted after processing ${processedRows} rows. Skipping cleanup.`,
      );
      return;
    }

    logger.info(
      `Finished migration of traces from Postgres to Clickhouse in ${Date.now() - start}ms`,
    );
  }

  async abort(): Promise<void> {
    logger.info(
      `Aborting migration of dataset run items from Postgres to clickhouse`,
    );
    this.isAborted = true;
  }
}

async function main() {
  const args = parseArgs({
    options: {
      batchSize: { type: "string", short: "b", default: "1000" },
      maxRowsToProcess: { type: "string", short: "r", default: "Infinity" },
      maxDate: {
        type: "string",
        short: "d",
        default: new Date().toISOString(),
      },
    },
  });

  const migration = new MigrateDatasetRunItemsFromPostgresToClickhouse();
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
