import "dotenv/config";

import { z } from "zod";
import { prisma, Prisma } from "@langfuse/shared/src/db";

const BackfillCalculatedGenerationArgsSchema = z
  .object({
    batchSize: z.coerce.number().optional().default(5_000),
    maxRowsToProcess: z.coerce.number().optional().default(Infinity), // Default to process all rows
    maxDate: z.coerce.date().optional().default(new Date()), // Default to today
  })
  .strict();

const backfillCalculatedGenerationCost = async () => {
  let previousTimeout;
  try {
    const args = parseArgs(process.argv.slice(2));
    const { batchSize, maxRowsToProcess, maxDate } = args;

    log("Starting backfillCalculatedGenerationCost with params", args);

    // Set the statement timeout
    const newTimeout = "19min";
    previousTimeout = await updateStatementTimeout(newTimeout, previousTimeout);

    // Drop column if it exists and add temporary column
    await addTemporaryColumnIfNotExists();

    let currentDateCutoff = maxDate.toISOString();
    let totalRowsProcessed = 0;

    log("Starting batch update loop...");

    // Step 3: Batch update in a loop
    while (true) {
      log(`Starting batch update for generations before: ${currentDateCutoff}`);
      const startDate = Date.now();
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
            WHERE
                start_time <= ${currentDateCutoff}::TIMESTAMP WITH TIME ZONE AT TIME ZONE 'UTC'
              	AND (internal_model IS NOT NULL
                      OR input_cost IS NOT NULL
                      OR output_cost IS NOT NULL
                      OR total_cost IS NOT NULL) 
            ORDER BY
              start_time DESC
            LIMIT ${batchSize}
        ),
        updated_batch AS (
            UPDATE observations o
            SET calculated_input_cost = 
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

      log(`Batch update completed in ${Date.now() - startDate} ms`);

      if (!batchUpdate[0]?.start_time) {
        log(
          `No more rows to process, breaking loop after ${totalRowsProcessed.toLocaleString()} rows processed.`,
        );

        break;
      }

      currentDateCutoff = batchUpdate[0]?.start_time.toISOString();
      totalRowsProcessed += batchSize;

      log(
        `Total rows processed after increment: ${totalRowsProcessed.toLocaleString()} rows`,
      );
      if (maxRowsToProcess && totalRowsProcessed >= maxRowsToProcess) {
        log(
          `Max rows to process reached: ${maxRowsToProcess.toLocaleString()}, breaking loop.`,
        );

        break;
      }
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

function parseArgs(args: string[]) {
  try {
    const namedArgs: Record<string, string | boolean> = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith("--")) {
        const key = args[i].slice(2);
        const value =
          args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true;
        namedArgs[key] = value;
        if (value !== true) i++; // Skip the next argument if it was used as a value
      }
    }

    return BackfillCalculatedGenerationArgsSchema.parse(namedArgs);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Validation error:", error.errors);
    } else {
      console.error("An unexpected error occurred:", error);
    }

    process.exit(1);
  }
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
    log("✅ Added temporary column tmp_has_calculated_cost");
  } else {
    log(
      "⚠️ Temporary column tmp_has_calculated_cost already exists. Continuing...",
    );
  }
}

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

  return previousTimeout;
}

function log(message: string, ...args: any[]) {
  console.log(new Date().toISOString(), " - ", message, ...args);
}

// Execute the script
backfillCalculatedGenerationCost();
