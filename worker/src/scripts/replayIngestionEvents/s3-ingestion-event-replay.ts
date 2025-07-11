#!/usr/bin/env tsx

/**
 * This script is used to filter a CSV file of events and convert it to a JSON file.
 * It then ingests the events into a BullMQ queue.
 *
 * Setup:
 * 1. Create a CSV file with the events you want to ingest. Take the downloaded CSV from AWS Athena.
 * 2. The file should be called events.csv and be in the root of the worker directory.
 * 4. Run the script with `pnpm --filter=worker run filter-events-csv`
 */

import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse";
import { randomUUID } from "crypto";
import {
  getClickhouseEntityType,
  getQueue,
  QueueJobs,
  QueueName,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import {
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const INPUT_FILE = "events.csv";
const OUTPUT_FILE = "events_filtered.csv";
const JSON_OUTPUT_FILE = "events_filtered.json";

// Redis configuration
// eslint-disable-next-line turbo/no-undeclared-env-vars
const QUEUE_NAME = QueueName.IngestionSecondaryQueue;
const JOB_NAME = QueueJobs.IngestionJob;

interface Stats {
  totalRows: number;
  filteredRows: number;
  processingTimeMs: number;
}

const client = new S3Client();

interface JsonOutputItem {
  useS3EventStore: true;
  authCheck: {
    validKey: true;
    scope: {
      projectId: string;
      accessLevel: "all";
    };
  };
  data: {
    eventBodyId: string;
    fileKey: string;
    type: string;
  };
}

async function filterCsvFile(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  console.log(`🚀 Starting to process ${inputPath}...`);
  console.log(`📝 Output will be written to ${outputPath}`);

  const stats: Stats = {
    totalRows: 0,
    filteredRows: 0,
    processingTimeMs: 0,
  };

  // Check if input file exists
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Get input file size for progress tracking
  const inputFileStats = fs.statSync(inputPath);
  const fileSizeGB = (inputFileStats.size / 1024 ** 3).toFixed(2);
  console.log(`📊 Input file size: ${fileSizeGB} GB`);

  const startTime = Date.now();

  return new Promise<void>((resolve, reject) => {
    const inputStream = fs.createReadStream(inputPath);
    const outputStream = fs.createWriteStream(outputPath);

    let operationColumnIndex = -1;
    let headers: string[] = [];
    let isHeaderProcessed = false;

    // Create CSV parser with proper configuration
    const parser = parse({
      columns: false, // Don't convert to objects, keep as arrays
      skip_empty_lines: true,
      relax_quotes: true,
      quote: '"',
      delimiter: ",",
    });

    // Progress tracking
    const progressInterval = setInterval(() => {
      if (stats.totalRows > 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rowsPerSecond = Math.round(stats.totalRows / elapsed);
        console.log(
          `📈 Processed ${stats.totalRows.toLocaleString()} rows (${rowsPerSecond.toLocaleString()} rows/sec)`,
        );
      }
    }, 10000); // Show progress every 10 seconds

    // Simple CSV row formatter
    const formatCsvRow = (row: string[]): string => {
      return (
        row
          .map((field) => {
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            if (
              field.includes(",") ||
              field.includes('"') ||
              field.includes("\n")
            ) {
              return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
          })
          .join(",") + "\n"
      );
    };

    // Handle parsing errors
    parser.on("error", (err: Error) => {
      clearInterval(progressInterval);
      reject(new Error(`CSV parsing error: ${err.message}`));
    });

    // Process each row
    parser.on("data", (row: string[]) => {
      stats.totalRows++;

      // Handle header row
      if (!isHeaderProcessed) {
        headers = row;
        operationColumnIndex = headers.findIndex(
          (header) => header.toLowerCase().trim() === "operation",
        );

        if (operationColumnIndex === -1) {
          clearInterval(progressInterval);
          reject(new Error('Could not find "operation" column in CSV header'));
          return;
        }

        console.log(
          `🎯 Found operation column at index ${operationColumnIndex}`,
        );
        console.log(
          `📋 Headers: ${headers.slice(0, 5).join(", ")}${headers.length > 5 ? "..." : ""}`,
        );

        // Write header to output
        outputStream.write(formatCsvRow(row));
        stats.filteredRows++;
        isHeaderProcessed = true;
        return;
      }

      // Check if the operation column contains "REST.PUT.OBJECT"
      if (row[operationColumnIndex]?.trim() === "REST.PUT.OBJECT") {
        outputStream.write(formatCsvRow(row));
        stats.filteredRows++;
      }
    });

    // Handle completion
    parser.on("end", () => {
      clearInterval(progressInterval);

      // Close the output stream
      outputStream.end();

      outputStream.on("finish", () => {
        stats.processingTimeMs = Date.now() - startTime;

        // Get output file size
        const outputFileStats = fs.statSync(outputPath);
        const outputFileSizeGB = (outputFileStats.size / 1024 ** 3).toFixed(2);

        console.log("\n🎉 === Processing Complete ===");
        console.log(
          `📊 Total rows processed: ${stats.totalRows.toLocaleString()}`,
        );
        console.log(
          `✅ Rows matching filter: ${stats.filteredRows.toLocaleString()}`,
        );
        console.log(
          `❌ Rows removed: ${(stats.totalRows - stats.filteredRows).toLocaleString()}`,
        );
        console.log(
          `⏱️  Processing time: ${(stats.processingTimeMs / 60000).toFixed(1)} minutes`,
        );
        console.log(
          `🚀 Average speed: ${Math.round(stats.totalRows / (stats.processingTimeMs / 1000)).toLocaleString()} rows/second`,
        );
        console.log(`📁 Output file size: ${outputFileSizeGB} GB`);
        console.log(
          `📉 Size reduction: ${((1 - outputFileStats.size / inputFileStats.size) * 100).toFixed(1)}%`,
        );

        resolve();
      });
    });

    // Connect streams
    inputStream.pipe(parser);
  });
}

async function convertCsvToJson(
  csvPath: string,
  jsonPath: string,
): Promise<void> {
  console.log(`🔄 Converting ${csvPath} to JSON format...`);
  console.log(`📝 JSON output will be written to ${jsonPath}`);

  const startTime = Date.now();
  let processedRows = 0;
  const jsonObjects: JsonOutputItem[] = [];

  // Check if CSV file exists
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  return new Promise<void>((resolve, reject) => {
    const inputStream = fs.createReadStream(csvPath);

    let keyColumnIndex = -1;
    let headers: string[] = [];
    let isHeaderProcessed = false;

    // Create CSV parser
    const parser = parse({
      columns: false,
      skip_empty_lines: true,
      relax_quotes: true,
      quote: '"',
      delimiter: ",",
    });

    // Progress tracking for conversion
    const progressInterval = setInterval(() => {
      if (processedRows > 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rowsPerSecond = Math.round(processedRows / elapsed);
        console.log(
          `🔄 Converted ${processedRows.toLocaleString()} rows to JSON (${rowsPerSecond.toLocaleString()} rows/sec)`,
        );
      }
    }, 5000);

    // Handle parsing errors
    parser.on("error", (err: Error) => {
      clearInterval(progressInterval);
      reject(new Error(`CSV parsing error during conversion: ${err.message}`));
    });

    // Process each row
    parser.on("data", async (row: string[]) => {
      // Handle header row
      if (!isHeaderProcessed) {
        headers = row;
        keyColumnIndex = headers.findIndex(
          (header) => header.toLowerCase().trim() === "key",
        );

        if (keyColumnIndex === -1) {
          clearInterval(progressInterval);
          reject(new Error('Could not find "key" column in CSV header'));
          return;
        }

        console.log(`🗝️  Found key column at index ${keyColumnIndex}`);
        isHeaderProcessed = true;
        return;
      }

      processedRows++;

      // Extract the key value
      const keyValue = row[keyColumnIndex]?.trim();
      if (!keyValue) {
        console.warn(
          `⚠️  Empty key value at row ${processedRows}, skipping...`,
        );
        return;
      }

      // Parse the S3 path: projectId/type/eventBodyId/eventId.json
      const pathMatch = keyValue.match(
        /^([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\.json$/,
      );

      if (!pathMatch) {
        console.warn(
          `⚠️  Invalid key format at row ${processedRows}: ${keyValue}, skipping...`,
        );
        return;
      }

      const [, projectId, type, eventBodyId, eventId] = pathMatch;

      // Create JSON object with the specified structure
      const jsonObject: JsonOutputItem = {
        useS3EventStore: true,
        authCheck: {
          validKey: true,
          scope: {
            projectId,
            accessLevel: "all",
          },
        },
        data: {
          eventBodyId,
          fileKey: eventId,
          type: `${type}-create`,
        },
      };

      jsonObjects.push(jsonObject);
    });

    // Handle completion
    parser.on("end", () => {
      clearInterval(progressInterval);

      try {
        // Write JSON file
        fs.writeFileSync(jsonPath, JSON.stringify(jsonObjects, null, 2));

        const processingTimeMs = Date.now() - startTime;
        const outputFileStats = fs.statSync(jsonPath);
        const outputFileSizeGB = (outputFileStats.size / 1024 ** 3).toFixed(2);

        console.log("\n🎉 === JSON Conversion Complete ===");
        console.log(
          `📊 Total rows converted: ${processedRows.toLocaleString()}`,
        );
        console.log(
          `📝 JSON objects created: ${jsonObjects.length.toLocaleString()}`,
        );
        console.log(
          `⏱️  Conversion time: ${(processingTimeMs / 1000).toFixed(1)} seconds`,
        );
        console.log(
          `🚀 Average speed: ${Math.round(processedRows / (processingTimeMs / 1000)).toLocaleString()} rows/second`,
        );
        console.log(`📁 JSON file size: ${outputFileSizeGB} GB`);

        resolve();
      } catch (error) {
        reject(
          new Error(`Failed to write JSON file: ${(error as Error).message}`),
        );
      }
    });

    // Connect streams
    inputStream.pipe(parser);
  });
}

async function ingestEventsToQueue(jsonPath: string): Promise<void> {
  console.log(`🚀 Starting to ingest events from ${jsonPath} to BullMQ...`);

  // Check if JSON file exists
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`JSON file not found: ${jsonPath}`);
  }

  const startTime = Date.now();
  let processedEvents = 0;

  try {
    // Read and parse JSON file
    const jsonContent = fs.readFileSync(jsonPath, "utf8");
    const events: JsonOutputItem[] = JSON.parse(jsonContent);

    console.log(`📊 Total events to ingest: ${events.length.toLocaleString()}`);

    // Set up BullMQ queue with Redis connection

    const queue = getQueue(QueueName.IngestionSecondaryQueue);

    if (!queue) {
      throw new Error("Failed to get queue");
    }

    console.log(`🔗 Connected to Redis and created queue: ${QUEUE_NAME}`);

    // Process events in batches of 500 for S3 restoration
    const S3_BATCH_SIZE = 1000;
    let processedCount = 0;

    for (let i = 0; i < events.length; i += S3_BATCH_SIZE) {
      const batch = events.slice(i, i + S3_BATCH_SIZE);
      console.log(
        `🔍 Processing S3 restoration batch ${Math.ceil((i + 1) / S3_BATCH_SIZE)} (${batch.length} events)`,
      );

      // Process all events in the batch concurrently
      await Promise.all(
        batch.map(async (event) => {
          const keyValue = `${event.authCheck.scope.projectId}/${getClickhouseEntityType(event.data.type)}/${event.data.eventBodyId}/${event.data.fileKey}.json`;

          try {
            // List versions to find the delete marker
            const listCommand = new ListObjectVersionsCommand({
              Bucket: env.LANGFUSE_S3_CORE_DATA_UPLOAD_BUCKET,
              Prefix: keyValue,
            });

            const response = await client.send(listCommand);

            // Find the delete marker
            const deleteMarkers = response.DeleteMarkers || [];
            const deleteMarker = deleteMarkers.find(
              (marker) => marker.Key === keyValue,
            );

            if (deleteMarker) {
              const deleteCommand = new DeleteObjectCommand({
                Bucket: env.LANGFUSE_S3_CORE_DATA_UPLOAD_BUCKET,
                Key: keyValue,
                VersionId: deleteMarker.VersionId,
              });

              await client.send(deleteCommand);
            }
          } catch (error) {
            console.error(
              `❌ Failed to restore ${keyValue}: ${(error as Error).message}`,
            );
          }
        }),
      );

      processedCount += batch.length;
      console.log(
        `✅ Completed S3 restoration batch (${processedCount}/${events.length} events processed)`,
      );
    }
    console.log(`🔍 All delete markers removed`);

    // Ingest events into queue in batches of 1000
    const BATCH_SIZE = 1000;
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);

      // Prepare jobs for bulk insertion
      const jobs = batch.map((event) => ({
        name: JOB_NAME,
        data: {
          payload: event,
          id: randomUUID(),
          timestamp: new Date(),
          name: JOB_NAME,
        },
      }));

      // Add batch to queue
      await queue.addBulk(jobs);

      processedEvents += batch.length;

      // Log progress every batch
      console.log(
        `✅ Added batch ${Math.ceil((i + 1) / BATCH_SIZE)} (${processedEvents}/${events.length} events)`,
      );

      // Log sample event from each batch for tracking
      if (batch.length > 0) {
        console.log(`📄 Sample event from batch: ${JSON.stringify(batch[0])}`);
      }
    }

    // Close the queue connection
    await queue.close();

    const processingTimeMs = Date.now() - startTime;

    console.log("\n🎉 === Event Ingestion Complete ===");
    console.log(
      `📊 Total events ingested: ${processedEvents.toLocaleString()}`,
    );
    console.log(
      `⏱️  Ingestion time: ${(processingTimeMs / 1000).toFixed(1)} seconds`,
    );
    console.log(
      `🚀 Average speed: ${Math.round(processedEvents / (processingTimeMs / 1000)).toLocaleString()} events/second`,
    );
    console.log(`🗂️  Queue name: ${QUEUE_NAME}`);
    console.log(`🔧 Job name: ${JOB_NAME}`);
  } catch (error) {
    throw new Error(
      `Failed to ingest events to queue: ${(error as Error).message}`,
    );
  }
}

// Main execution
async function main() {
  try {
    const inputPath = path.resolve(INPUT_FILE);
    const outputPath = path.resolve(OUTPUT_FILE);
    const jsonOutputPath = path.resolve(JSON_OUTPUT_FILE);

    console.log(`📂 Input file: ${inputPath}`);
    console.log(`📂 Output file: ${outputPath}`);
    console.log(`📂 JSON output file: ${jsonOutputPath}`);

    // Step 1: Filter the CSV file
    await filterCsvFile(inputPath, outputPath);

    console.log("\n✅ CSV filtering completed successfully!");

    // Step 2: Convert filtered CSV to JSON
    await convertCsvToJson(outputPath, jsonOutputPath);

    console.log("\n✅ JSON conversion completed successfully!");

    // Step 3: Ingest events to BullMQ
    await ingestEventsToQueue(jsonOutputPath);

    console.log("\n✅ Script completed successfully!");
  } catch (error) {
    console.error("\n❌ Error:", (error as Error).message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}
