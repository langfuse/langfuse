// This script can be used to manually refill ingestion events.
// Execute with caution in production.

import { readFileSync, writeFileSync } from "fs";
import { parse } from "csv-parse/sync";
import {
  QueueJobs,
  IngestionQueue,
  eventTypes,
} from "@langfuse/shared/src/server";
import { logger } from "@langfuse/shared/src/server";
import { redis } from "@langfuse/shared/src/server";

const main = async () => {
  // Read and parse CSV file
  // Find events.csv in root directory
  logger.info(`Current working directory: ${process.cwd()}`);
  const fileContent = readFileSync("./../events.csv", "utf-8");

  type CsvType = {
    keys: String;
    processed?: string;
  };

  const records: CsvType[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  });

  // Store records in JSON file for backup
  const jsonContent = JSON.stringify(records, null, 2);
  writeFileSync("./../events.json", jsonContent);
  logger.info("Stored records backup in events.json");

  // Read from backup JSON file
  const backupContent = readFileSync("./../events.json", "utf-8");
  const jsonRecords = JSON.parse(backupContent) as CsvType[];

  // Filter out already processed records
  const unprocessedRecords = jsonRecords.filter(
    (record) => record.processed !== "true",
  );

  console.log(`Found ${unprocessedRecords.length} unprocessed records`);

  // Create queue connection
  const ingestionQueue = IngestionQueue.getInstance();

  // Process each record
  const BATCH_SIZE = 20;

  for (let i = 0; i < unprocessedRecords.length; i += BATCH_SIZE) {
    const batch = unprocessedRecords.slice(i, i + BATCH_SIZE);
    const events = batch.map((record) => {
      const [projectId, type, eventBodyId, eventIdWithExt] =
        record.keys.split("/");
      const eventId = eventIdWithExt.replace(".json", "");

      const eventType = (type +
        "-create") as (typeof eventTypes)[keyof typeof eventTypes];

      return {
        name: QueueJobs.IngestionJob as const,
        data: {
          timestamp: new Date(),
          id: eventId,
          payload: {
            data: {
              type: eventType,
              eventBodyId: eventBodyId,
              fileKey: eventId,
            },
            authCheck: {
              validKey: true as const,
              scope: {
                projectId: projectId,
                accessLevel: "project" as const,
              },
            },
          },
          name: QueueJobs.IngestionJob as const,
        },
      };
    });

    // Add batch to queue
    await ingestionQueue?.addBulk(events);

    // Mark records as processed
    // batch.forEach((record, index) => {
    //   const recordIndex = records.findIndex((r) => r.keys === record.keys);
    //   if (recordIndex !== -1) {
    //     records[recordIndex].processed = "true";
    //   }
    // });

    logger.info(`Processed batch of ${events.length} events`);
  }

  // Write updated records back to JSON
  // const jsonString = JSON.stringify(records, null, 2);
  // writeFileSync("./../events.json", jsonString);

  logger.info("Done processing events");
};

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("Error running script:", err);
    })
    .finally(() => {
      redis?.disconnect();
      process.exit(0);
    });
}
