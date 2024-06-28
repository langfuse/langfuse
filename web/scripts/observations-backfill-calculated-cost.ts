import "dotenv/config";

import { prisma, Prisma } from "@langfuse/shared/src/db";

type BackfillCalculatedGenerationCostParams = {
  batchSize: number;
  maxRowsToProcess: number | null;
  sleepBetweenMs: number;
};

const backfillCalculatedGenerationCost = async (
  params: BackfillCalculatedGenerationCostParams,
) => {
  let previousTimeout;
  try {
    const { batchSize, maxRowsToProcess, sleepBetweenMs } = params;
    log("Starting backfillCalculatedGenerationCost with params", params);

    // Set the statement timeout
    const newTimeout = "19min";

    const [{ statement_timeout: previousTimeoutRead }] = await prisma.$queryRaw<
      { statement_timeout: string }[]
    >(Prisma.sql`SHOW statement_timeout;`);
    log(`Current statement_timeout read from DB: ${previousTimeoutRead}`);

    if (!previousTimeoutRead || previousTimeoutRead === newTimeout) {
      // If the statement_timeout is already set to 19 minutes, assume it was set by this script and reset it to 2 minutes
      previousTimeout = "2min";
    } else {
      previousTimeout = previousTimeoutRead;
    }

    log(`Setting statement_timeout to ${newTimeout} minutes...`);
    await prisma.$executeRawUnsafe(`SET statement_timeout = '${newTimeout}';`);
    log(
      `Updated statement_timeout. Current statement_timeout: ${JSON.stringify(
        await prisma.$queryRaw(Prisma.sql`SHOW statement_timeout;`),
      )}`,
    );

    // Drop column if it exists and add temporary column
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
      log("✅ Added temporary column tmp_has_calculated_cost");
    } else {
      log(
        "⚠️ Temporary column tmp_has_calculated_cost already exists. Continuing...",
      );
    }

    let lastId = "";
    let totalRowsProcessed = 0;

    log("Starting batch update loop...");

    // Step 3: Batch update in a loop
    while (true) {
      log(`Starting batch update with lastId: ${lastId}`);
      const startDate = Date.now();
      const batchUpdate = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        WITH batch AS (
            SELECT o.id,
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
            WHERE o.id > ${lastId}
            ORDER BY o.id ASC
            LIMIT ${batchSize}
        ),
        updated_batch AS (
            UPDATE observations o
            SET calculated_input_cost = COALESCE(batch.input_cost, batch.prompt_tokens::numeric * batch.input_price),
                calculated_output_cost = COALESCE(batch.output_cost, batch.completion_tokens::numeric * batch.output_price),
                calculated_total_cost = COALESCE(
                    batch.total_cost,
                    CASE
                        WHEN batch.total_price IS NOT NULL AND batch.total_tokens IS NOT NULL THEN batch.total_price * batch.total_tokens::numeric
                        ELSE batch.prompt_tokens::numeric * batch.input_price + batch.completion_tokens::numeric * batch.output_price
                    END
                ),
                internal_model_id = batch.model_id,
                tmp_has_calculated_cost = TRUE
            FROM batch
            WHERE o.id = batch.id
            RETURNING o.id
        )
        -- Get the last id of the updated batch
        SELECT id FROM batch LIMIT 1 OFFSET ${batchSize - 1};
      `);

      log(`Batch update completed in ${Date.now() - startDate} ms`);

      if (!batchUpdate[0]?.id) {
        log(
          `No more rows to process, breaking loop after ${totalRowsProcessed} rows processed.`,
        );

        break;
      }

      lastId = batchUpdate[0]?.id;
      totalRowsProcessed += batchSize;

      log(`Total rows processed after increment: ${totalRowsProcessed} rows`);
      if (maxRowsToProcess && totalRowsProcessed >= maxRowsToProcess) {
        log(`Max rows to process reached: ${maxRowsToProcess}, breaking loop.`);

        break;
      }

      await new Promise((resolve) => setTimeout(resolve, sleepBetweenMs));
    }

    log("✅ Finished batch update loop.");

    // Drop the temporary column
    log("Dropping temporary column...");
    await prisma.$executeRaw`ALTER TABLE observations DROP COLUMN IF EXISTS tmp_has_calculated_cost;`;
    log("✅ Dropped temporary column");

    log("✅ Finished backfillCalculatedGenerationCost");
  } catch (err) {
    console.error("Error executing script", err);
  } finally {
    // Reset the statement timeout to two minutes
    await prisma.$executeRawUnsafe(
      `SET statement_timeout = '${previousTimeout}';`,
    );
    log(
      `Reset statement_timeout to ${previousTimeout}. Current statement_timeout: ${JSON.stringify(
        await prisma.$queryRaw(Prisma.sql`SHOW statement_timeout;`),
      )}`,
    );

    // Disconnect from the database
    await prisma.$disconnect();
    log("Disconnected from the database.");
  }
};

// Execute the script
backfillCalculatedGenerationCost({
  batchSize: 10_000,
  maxRowsToProcess: null,
  sleepBetweenMs: 0,
});

function log(message: string, ...args: any[]) {
  console.log(new Date().toISOString(), " - ", message, ...args);
}
