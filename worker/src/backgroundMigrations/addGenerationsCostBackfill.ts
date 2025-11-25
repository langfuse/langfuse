import { IBackgroundMigration } from "./IBackgroundMigration";
import { logger } from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma, Prisma } from "@langfuse/shared/src/db";

type StatementTimeout = {
  statement_timeout: string;
};

async function updateStatementTimeout(
  newTimeout: string,
  previousTimeout: any,
) {
  const [{ statement_timeout: previousTimeoutRead }] = await prisma.$queryRaw<
    StatementTimeout[]
  >(Prisma.sql`SHOW statement_timeout;`);
  logger.info(`Current statement_timeout ${previousTimeoutRead}`);
  if (!previousTimeoutRead || previousTimeoutRead === newTimeout) {
    // If the statement_timeout is already set to 19 minutes, assume it was set by this script and reset it to 2 minutes
    previousTimeout = "2min";
  } else {
    previousTimeout = previousTimeoutRead;
  }
  await prisma.$executeRawUnsafe(`SET statement_timeout = '${newTimeout}';`);
  logger.info(`Updated statement_timeout to ${newTimeout}`);
  return previousTimeout;
}

async function addTemporaryColumnIfNotExists() {
  const columnExists = await prisma.$queryRaw<{ column_exists: boolean }[]>(
    Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'observations'
        AND column_name = 'tmp_has_calculated_cost'
      ) AS column_exists;
    `,
  );
  if (!columnExists[0]?.column_exists) {
    await prisma.$executeRaw`ALTER TABLE observations ADD COLUMN tmp_has_calculated_cost BOOLEAN DEFAULT FALSE;`;
    logger.info("Added temporary column tmp_has_calculated_cost");
  } else {
    logger.info(
      "Temporary column tmp_has_calculated_cost already exists. Continuing...",
    );
  }
}

export default class AddGenerationsCostBackfill
  implements IBackgroundMigration
{
  private isAborted = false;

  async validate(
    // eslint-disable-next-line no-unused-vars
    args: Record<string, unknown>,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    // No validation to be done
    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    logger.info(
      `Running AddGenerationsCostBackfill migration with ${JSON.stringify(args)}`,
    );
    let previousTimeout;

    const maxRowsToProcess = Number(args.maxRowsToProcess ?? Infinity);
    const batchSize = Number(args.batchSize ?? 1000);
    let currentDateCutoff = args.maxDate ?? new Date().toISOString();

    try {
      // Set the statement timeout
      const newTimeout = "19min";
      previousTimeout = await updateStatementTimeout(
        newTimeout,
        previousTimeout,
      );

      // Add tracking column
      await addTemporaryColumnIfNotExists();

      let totalRowsProcessed = 0;
      while (!this.isAborted && totalRowsProcessed < maxRowsToProcess) {
        const batchUpdate = await prisma.$queryRaw<
          { start_time: Date }[]
        >(Prisma.sql`
          WITH batch AS (
            SELECT o.id,
              o.start_time,
              o.prompt_tokens,
              o.completion_tokens,
              o.total_tokens,
              o.input_cost,
              o.output_cost,
              o.total_cost,
              m.id AS model_id,
              m.input_price,
              m.output_price,
              m.total_price
            FROM observations o
            LEFT JOIN LATERAL (
              SELECT models.id,
                models.input_price,
                models.output_price,
                models.total_price
              FROM models
              WHERE (models.project_id = o.project_id OR models.project_id IS NULL)
                AND models.model_name = o.internal_model
                AND (models.start_date < o.start_time OR models.start_date IS NULL)
                AND o.unit = models.unit
              ORDER BY models.project_id, models.start_date DESC NULLS LAST
              LIMIT 1
            ) m ON true
            WHERE start_time <= ${currentDateCutoff}::TIMESTAMP WITH TIME ZONE AT TIME ZONE 'UTC'
           	  AND (internal_model IS NOT NULL
              OR input_cost IS NOT NULL
              OR output_cost IS NOT NULL
              OR total_cost IS NOT NULL) 
            ORDER BY start_time DESC
            LIMIT ${batchSize}
          ),
          updated_batch AS (
            UPDATE observations o
              SET 
                calculated_input_cost = 
                CASE
                  WHEN batch.input_cost IS NULL AND batch.output_cost IS NULL AND batch.total_cost IS NULL 
                  THEN batch.prompt_tokens::numeric * batch.input_price
                  ELSE batch.input_cost
                END,
                calculated_output_cost = 
                CASE
                  WHEN batch.input_cost IS NULL AND batch.output_cost IS NULL AND batch.total_cost IS NULL 
                  THEN batch.completion_tokens::numeric * batch.output_price
                  ELSE batch.output_cost
                END,
                calculated_total_cost = 
                CASE
                  WHEN batch.input_cost IS NULL AND batch.output_cost IS NULL AND batch.total_cost IS NULL 
                  THEN
                    CASE
                      WHEN batch.total_price IS NOT NULL AND batch.total_tokens IS NOT NULL THEN batch.total_price * batch.total_tokens::numeric
                      ELSE batch.prompt_tokens::numeric * batch.input_price + batch.completion_tokens::numeric * batch.output_price
                    END
                  ELSE batch.total_cost
                END,
                internal_model_id = batch.model_id,
                tmp_has_calculated_cost = TRUE
            FROM batch
            WHERE o.id = batch.id
            RETURNING o.id
          )
          -- Get the last id of the updated batch
          SELECT start_time FROM batch LIMIT 1 OFFSET ${batchSize - 1};
        `);

        if (!batchUpdate[0]?.start_time) {
          logger.info(
            `No more rows to process, breaking loop after ${totalRowsProcessed} rows processed.`,
          );
          break;
        }

        currentDateCutoff = batchUpdate[0]?.start_time.toISOString();
        totalRowsProcessed += batchSize;

        logger.info(
          `Total rows processed after increment: ${totalRowsProcessed} rows`,
        );
        if (maxRowsToProcess && totalRowsProcessed >= maxRowsToProcess) {
          logger.info(
            `Max rows to process reached: ${maxRowsToProcess.toLocaleString()}, breaking loop.`,
          );

          break;
        }
      }

      if (this.isAborted) {
        logger.info(
          `Backfill aborted after processing ${totalRowsProcessed} rows. Skipping cleanup.`,
        );
        return;
      }

      await prisma.$executeRaw`ALTER TABLE observations DROP COLUMN IF EXISTS tmp_has_calculated_cost;`;
      logger.info(
        `Backfill completed after processing ${totalRowsProcessed} rows`,
      );
    } catch (e) {
      logger.error(`Error backfilling costs: ${e}`, e);
      throw e;
    } finally {
      await prisma.$executeRawUnsafe(
        `SET statement_timeout = '${previousTimeout}';`,
      );
      logger.info(`Reset statement_timeout to ${previousTimeout}`);
    }
  }

  async abort(): Promise<void> {
    logger.info(`Aborting AddGenerationsCostBackfill migration`);
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

  const migration = new AddGenerationsCostBackfill();
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
      logger.error(`Migration execution failed: ${error}`);
      process.exit(1); // Exit with an error code
    });
}
