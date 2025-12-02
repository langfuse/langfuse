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
import * as readline from "readline";
import { parse } from "csv-parse";
import { randomUUID } from "crypto";
import { getQueue, QueueJobs, QueueName } from "@langfuse/shared/src/server";

const INPUT_FILE = "events.csv";
const OUTPUT_FILE = "events_filtered.csv";
const JSONL_OUTPUT_FILE = "events_filtered.jsonl";

// Redis configuration
// eslint-disable-next-line turbo/no-undeclared-env-vars
const QUEUE_NAME = QueueName.IngestionSecondaryQueue;
const JOB_NAME = QueueJobs.IngestionJob;

interface Stats {
  totalRows: number;
  filteredRows: number;
  processingTimeMs: number;
}

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
    let keyColumnIndex = -1;
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
        keyColumnIndex = headers.findIndex(
          (header) => header.toLowerCase().trim() === "key",
        );

        if (operationColumnIndex === -1) {
          clearInterval(progressInterval);
          reject(new Error('Could not find "operation" column in CSV header'));
          return;
        }

        if (keyColumnIndex === -1) {
          clearInterval(progressInterval);
          reject(new Error('Could not find "key" column in CSV header'));
          return;
        }

        console.log(
          `🎯 Found operation column at index ${operationColumnIndex}`,
        );
        console.log(`🗝️  Found key column at index ${keyColumnIndex}`);
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
      // and exclude keys that start with "otel/" (OpenTelemetry events)
      const keyValue = row[keyColumnIndex]?.trim();
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

async function convertCsvToJsonl(
  csvPath: string,
  jsonlPath: string,
): Promise<void> {
  console.log(`🔄 Converting ${csvPath} to JSONL format...`);
  console.log(`📝 JSONL output will be written to ${jsonlPath}`);

  const startTime = Date.now();
  let processedRows = 0;
  let writtenObjects = 0;

  // Check if CSV file exists
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  return new Promise<void>((resolve, reject) => {
    const inputStream = fs.createReadStream(csvPath);
    const outputStream = fs.createWriteStream(jsonlPath);

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
          `🔄 Converted ${processedRows.toLocaleString()} rows to JSONL (${rowsPerSecond.toLocaleString()} rows/sec)`,
        );
      }
    }, 5000);

    // Handle parsing errors
    parser.on("error", (err: Error) => {
      clearInterval(progressInterval);
      outputStream.end();
      reject(new Error(`CSV parsing error during conversion: ${err.message}`));
    });

    // Process each row
    parser.on("data", (row: string[]) => {
      // Handle header row
      if (!isHeaderProcessed) {
        headers = row;
        keyColumnIndex = headers.findIndex(
          (header) => header.toLowerCase().trim() === "key",
        );

        if (keyColumnIndex === -1) {
          clearInterval(progressInterval);
          outputStream.end();
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
        /^([^/]+)\/([^/]+)\/(.+)\/([^/]+)\.json$/,
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

      // Write each JSON object as a single line (JSONL format)
      outputStream.write(JSON.stringify(jsonObject) + "\n");
      writtenObjects++;
    });

    // Handle completion
    parser.on("end", () => {
      clearInterval(progressInterval);
      outputStream.end();

      outputStream.on("finish", () => {
        const processingTimeMs = Date.now() - startTime;
        const outputFileStats = fs.statSync(jsonlPath);
        const outputFileSizeGB = (outputFileStats.size / 1024 ** 3).toFixed(2);

        console.log("\n🎉 === JSONL Conversion Complete ===");
        console.log(
          `📊 Total rows converted: ${processedRows.toLocaleString()}`,
        );
        console.log(
          `📝 JSON objects written: ${writtenObjects.toLocaleString()}`,
        );
        console.log(
          `⏱️  Conversion time: ${(processingTimeMs / 1000).toFixed(1)} seconds`,
        );
        console.log(
          `🚀 Average speed: ${Math.round(processedRows / (processingTimeMs / 1000)).toLocaleString()} rows/second`,
        );
        console.log(`📁 JSONL file size: ${outputFileSizeGB} GB`);

        resolve();
      });
    });

    // Connect streams
    inputStream.pipe(parser);
  });
}

async function ingestEventsToQueue(jsonlPath: string): Promise<void> {
  console.log(`🚀 Starting to ingest events from ${jsonlPath} to BullMQ...`);

  // Check if JSONL file exists
  if (!fs.existsSync(jsonlPath)) {
    throw new Error(`JSONL file not found: ${jsonlPath}`);
  }

  const startTime = Date.now();
  let processedEvents = 0;
  let totalEvents = 0;

  // Set up BullMQ queue with Redis connection
  const queue = getQueue(QueueName.IngestionSecondaryQueue);

  if (!queue) {
    throw new Error("Failed to get queue");
  }

  console.log(`🔗 Connected to Redis and created queue: ${QUEUE_NAME}`);

  // First pass: count total lines and process S3 restoration in batches
  console.log(`📊 Counting events and processing S3 restoration...`);

  console.log(`📊 Total events found: ${totalEvents.toLocaleString()}`);

  // Second pass: ingest events into queue in batches
  console.log(`📥 Starting queue ingestion...`);

  const BATCH_SIZE = 1000;
  let batch: JsonOutputItem[] = [];
  let batchNumber = 0;

  const ingestStream = fs.createReadStream(jsonlPath);
  const ingestRl = readline.createInterface({
    input: ingestStream,
    crlfDelay: Infinity,
  });

  for await (const line of ingestRl) {
    if (!line.trim()) continue;

    try {
      const event: JsonOutputItem = JSON.parse(line);
      batch.push(event);

      // Process queue ingestion in batches
      if (batch.length >= BATCH_SIZE) {
        batchNumber++;
        await processQueueBatch(
          queue,
          batch,
          batchNumber,
          processedEvents,
          totalEvents,
        );
        processedEvents += batch.length;
        batch = [];
      }
    } catch {
      // Already warned during first pass
    }
  }

  // Process remaining batch
  if (batch.length > 0) {
    batchNumber++;
    await processQueueBatch(
      queue,
      batch,
      batchNumber,
      processedEvents,
      totalEvents,
    );
    processedEvents += batch.length;
  }

  // Close the queue connection
  await queue.close();

  const processingTimeMs = Date.now() - startTime;

  console.log("\n🎉 === Event Ingestion Complete ===");
  console.log(`📊 Total events ingested: ${processedEvents.toLocaleString()}`);
  console.log(
    `⏱️  Ingestion time: ${(processingTimeMs / 1000).toFixed(1)} seconds`,
  );
  console.log(
    `🚀 Average speed: ${Math.round(processedEvents / (processingTimeMs / 1000)).toLocaleString()} events/second`,
  );
  console.log(`🗂️  Queue name: ${QUEUE_NAME}`);
  console.log(`🔧 Job name: ${JOB_NAME}`);
}

async function processQueueBatch(
  queue: NonNullable<ReturnType<typeof getQueue>>,
  batch: JsonOutputItem[],
  batchNumber: number,
  processedEvents: number,
  totalEvents: number,
): Promise<void> {
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

  // Log progress
  console.log(
    `✅ Added batch ${batchNumber} (${processedEvents + batch.length}/${totalEvents} events)`,
  );

  // Log sample event from each batch for tracking
  if (batch.length > 0) {
    console.log(`📄 Sample event from batch: ${JSON.stringify(batch[0])}`);
  }
}

// Main execution
async function main() {
  try {
    const inputPath = path.resolve(INPUT_FILE);
    const outputPath = path.resolve(OUTPUT_FILE);
    const jsonlOutputPath = path.resolve(JSONL_OUTPUT_FILE);

    console.log(`📂 Input file: ${inputPath}`);
    console.log(`📂 Output file: ${outputPath}`);
    console.log(`📂 JSONL output file: ${jsonlOutputPath}`);

    // Step 1: Filter the CSV file
    await filterCsvFile(inputPath, outputPath);

    console.log("\n✅ CSV filtering completed successfully!");

    // Step 2: Convert filtered CSV to JSONL
    await convertCsvToJsonl(outputPath, jsonlOutputPath);

    console.log("\n✅ JSONL conversion completed successfully!");

    // Step 3: Ingest events to BullMQ
    await ingestEventsToQueue(jsonlOutputPath);

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
