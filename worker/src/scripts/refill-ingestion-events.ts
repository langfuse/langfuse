// This script can be used to manually refill ingestion events.
// Execute with caution in production.

import { readFileSync } from "fs";
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
  };

  const records: CsvType[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  });

  console.log(JSON.stringify(records));

  // Create queue connection
  const ingestionQueue = IngestionQueue.getInstance();

  // Process each record
  const BATCH_SIZE = 100; // Process 100 events at a time

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const events = batch.map((record) => {
      const [projectId, type, eventBodyId, eventIdWithExt] =
        record.keys.split("/");
      const eventId = eventIdWithExt.replace(".json", "");

      const eventType = (type +
        "-create") as (typeof eventTypes)[keyof typeof eventTypes];

      console.log(eventType);
      return {
        name: QueueJobs.IngestionJob as const,
        data: {
          timestamp: new Date(),
          id: eventId,
          payload: {
            data: {
              type: eventType,
              eventBodyId: eventBodyId,
            },
            authCheck: {
              validKey: true as const,
              scope: {
                projectId: projectId,
                accessLevel: "all" as const,
              },
            },
          },
          name: QueueJobs.IngestionJob as const,
        },
      };
    });

    // Add batch to queue
    await ingestionQueue?.addBulk(events);

    logger.info(`Processed batch of ${events.length} events`);
  }

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
