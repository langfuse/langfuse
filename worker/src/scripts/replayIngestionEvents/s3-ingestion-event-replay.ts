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
import {
  OtelIngestionQueue,
  QueueJobs,
  QueueName,
  SecondaryIngestionQueue,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";

const INPUT_FILE = "events.csv";
const OUTPUT_FILE = "events_filtered.csv";
const JSONL_OUTPUT_FILE = "events_filtered.jsonl";
const OTEL_JSONL_OUTPUT_FILE = "otel_events_filtered.jsonl";

// Redis configuration

const QUEUE_NAME = QueueName.IngestionSecondaryQueue;
const JOB_NAME = QueueJobs.IngestionJob;

const OTEL_NAME = QueueName.OtelIngestionQueue;
const OTEL_JOB_NAME = QueueJobs.OtelIngestionJob;

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

interface OTelJsonOutputItem {
  authCheck: {
    validKey: true;
    scope: {
      projectId: string;
      accessLevel: "project";
    };
  };
  data: {
    fileKey: string;
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
  otelJsonlPath: string,
): Promise<void> {
  console.log(`🔄 Converting ${csvPath} to JSONL format...`);
  console.log(`📝 JSONL output will be written to ${jsonlPath}`);
  console.log(`📝 OTEL JSONL output will be written to ${otelJsonlPath}`);

  const startTime = Date.now();
  let processedRows = 0;
  let writtenObjects = 0;
  let writtenOtelObjects = 0;

  // Check if CSV file exists
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  return new Promise<void>((resolve, reject) => {
    const inputStream = fs.createReadStream(csvPath);
    const outputStream = fs.createWriteStream(jsonlPath);
    const otelOutputStream = fs.createWriteStream(otelJsonlPath);

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
      otelOutputStream.end();
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

      // Handle two S3 key path formats:
      // 1. projectId/type/eventBodyId/eventId.json (original)
      // 2. otel/projectId/yyyy/mm/dd/hh/mm/eventId.json (OTEL-style)

      // Match OTEL-style: otel/projectId/yyyy/mm/dd/hh/mm/eventId.json
      const otelMatch = keyValue.match(
        /^otel\/([^/]+)\/(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})\/([^.]+)\.json$/,
      );

      // Match original format
      const regularMatch = keyValue.match(
        /^([^/]+)\/([^/]+)\/(.+)\/([^/]+)\.json$/,
      );

      if (otelMatch) {
        const [, projectId] = otelMatch;
        const otelJsonObject: OTelJsonOutputItem = {
          authCheck: {
            validKey: true,
            scope: {
              projectId,
              accessLevel: "project",
            },
          },
          data: {
            fileKey: keyValue,
          },
        };

        // Write each OTEL JSON object as a single line (JSONL format)
        otelOutputStream.write(JSON.stringify(otelJsonObject) + "\n");
        writtenOtelObjects++;
      } else if (regularMatch) {
        const [, projectId, type, eventBodyId, eventId] = regularMatch;

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
      } else {
        console.warn(
          `⚠️  Invalid key format at row ${processedRows}: ${keyValue}, skipping...`,
        );
        return;
      }
    });

    // Handle completion
    parser.on("end", () => {
      clearInterval(progressInterval);
      outputStream.end();
      otelOutputStream.end();

      let finishedStreams = 0;
      const checkComplete = () => {
        finishedStreams++;
        if (finishedStreams === 2) {
          const processingTimeMs = Date.now() - startTime;
          const outputFileStats = fs.statSync(jsonlPath);
          const otelOutputFileStats = fs.statSync(otelJsonlPath);
          const outputFileSizeGB = (outputFileStats.size / 1024 ** 3).toFixed(
            2,
          );
          const otelOutputFileSizeGB = (
            otelOutputFileStats.size /
            1024 ** 3
          ).toFixed(2);

          console.log("\n🎉 === JSONL Conversion Complete ===");
          console.log(
            `📊 Total rows converted: ${processedRows.toLocaleString()}`,
          );
          console.log(
            `📝 JSON objects written: ${writtenObjects.toLocaleString()}`,
          );
          console.log(
            `📝 OTEL objects written: ${writtenOtelObjects.toLocaleString()}`,
          );
          console.log(
            `⏱️  Conversion time: ${(processingTimeMs / 1000).toFixed(1)} seconds`,
          );
          console.log(
            `🚀 Average speed: ${Math.round(processedRows / (processingTimeMs / 1000)).toLocaleString()} rows/second`,
          );
          console.log(`📁 JSONL file size: ${outputFileSizeGB} GB`);
          console.log(`📁 OTEL JSONL file size: ${otelOutputFileSizeGB} GB`);

          resolve();
        }
      };

      outputStream.on("finish", checkComplete);
      otelOutputStream.on("finish", checkComplete);
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
  const queues = new Set<
    NonNullable<ReturnType<typeof SecondaryIngestionQueue.getInstance>>
  >();

  console.log(
    `🔗 Connected to Redis and created shard-aware queues: ${QUEUE_NAME}`,
  );

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
        await processQueueBatch(queues, batch, batchNumber, processedEvents);
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
    await processQueueBatch(queues, batch, batchNumber, processedEvents);
    processedEvents += batch.length;
  }

  // Close the queue connection
  await Promise.all(Array.from(queues).map((queue) => queue.close()));

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
  queues: Set<
    NonNullable<ReturnType<typeof SecondaryIngestionQueue.getInstance>>
  >,
  batch: JsonOutputItem[],
  batchNumber: number,
  processedEvents: number,
): Promise<void> {
  const jobsByQueue = new Map<
    string,
    {
      queue: NonNullable<
        ReturnType<typeof SecondaryIngestionQueue.getInstance>
      >;
      jobs: Array<{
        name: QueueJobs.IngestionJob;
        data: TQueueJobTypes[QueueName.IngestionSecondaryQueue];
      }>;
    }
  >();

  for (const event of batch) {
    const queue = SecondaryIngestionQueue.getInstance({
      shardingKey: `${event.authCheck.scope.projectId}-${event.data.eventBodyId}`,
    });

    if (!queue) {
      throw new Error("Failed to get queue");
    }

    queues.add(queue);

    const existing = jobsByQueue.get(queue.name);
    const nextJob: {
      name: QueueJobs.IngestionJob;
      data: TQueueJobTypes[QueueName.IngestionSecondaryQueue];
    } = {
      name: QueueJobs.IngestionJob,
      data: {
        payload:
          event as TQueueJobTypes[QueueName.IngestionSecondaryQueue]["payload"],
        id: randomUUID(),
        timestamp: new Date(),
        name: QueueJobs.IngestionJob,
      },
    };

    if (existing) {
      existing.jobs.push(nextJob);
    } else {
      jobsByQueue.set(queue.name, {
        queue,
        jobs: [nextJob],
      });
    }
  }

  await Promise.all(
    Array.from(jobsByQueue.values()).map(({ queue, jobs }) =>
      queue.addBulk(jobs),
    ),
  );

  // Log progress
  console.log(
    `✅ Added batch ${batchNumber} (${processedEvents + batch.length} events) to queue`,
  );

  // Log sample event from each batch for tracking
  if (batch.length > 0) {
    console.log(`📄 Sample event from batch: ${JSON.stringify(batch[0])}`);
  }
}

async function ingestEventsToOtelQueue(otelJsonlPath: string): Promise<void> {
  console.log(
    `🚀 Starting to ingest OTEL events from ${otelJsonlPath} to BullMQ...`,
  );

  // Check if JSONL file exists
  if (!fs.existsSync(otelJsonlPath)) {
    throw new Error(`JSONL file not found: ${otelJsonlPath}`);
  }

  const startTime = Date.now();
  let processedEvents = 0;
  const queues = new Set<
    NonNullable<ReturnType<typeof OtelIngestionQueue.getInstance>>
  >();

  console.log(
    `🔗 Connected to Redis and created shard-aware queues: ${OTEL_NAME}`,
  );

  // Second pass: ingest events into queue in batches
  console.log(`📥 Starting OTEL queue ingestion...`);

  const BATCH_SIZE = 1000;
  let batch: OTelJsonOutputItem[] = [];
  let batchNumber = 0;

  const ingestStream = fs.createReadStream(otelJsonlPath);
  const ingestRl = readline.createInterface({
    input: ingestStream,
    crlfDelay: Infinity,
  });

  for await (const line of ingestRl) {
    if (!line.trim()) continue;

    try {
      const event: OTelJsonOutputItem = JSON.parse(line);
      batch.push(event);

      // Process queue ingestion in batches
      if (batch.length >= BATCH_SIZE) {
        batchNumber++;
        await processOtelQueueBatch(
          queues,
          batch,
          batchNumber,
          processedEvents,
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
    await processOtelQueueBatch(queues, batch, batchNumber, processedEvents);
    processedEvents += batch.length;
  }

  // Close the queue connection
  await Promise.all(Array.from(queues).map((queue) => queue.close()));

  const processingTimeMs = Date.now() - startTime;

  console.log("\n🎉 === OTEL Event Ingestion Complete ===");
  console.log(`📊 Total events ingested: ${processedEvents.toLocaleString()}`);
  console.log(
    `⏱️  Ingestion time: ${(processingTimeMs / 1000).toFixed(1)} seconds`,
  );
  console.log(
    `🚀 Average speed: ${Math.round(processedEvents / (processingTimeMs / 1000)).toLocaleString()} events/second`,
  );
  console.log(`🗂️  Queue name: ${OTEL_NAME}`);
  console.log(`🔧 Job name: ${OTEL_JOB_NAME}`);
}

async function processOtelQueueBatch(
  queues: Set<NonNullable<ReturnType<typeof OtelIngestionQueue.getInstance>>>,
  batch: OTelJsonOutputItem[],
  batchNumber: number,
  processedEvents: number,
): Promise<void> {
  const jobsByQueue = new Map<
    string,
    {
      queue: NonNullable<ReturnType<typeof OtelIngestionQueue.getInstance>>;
      jobs: Array<{
        name: QueueJobs.OtelIngestionJob;
        data: TQueueJobTypes[QueueName.OtelIngestionQueue];
      }>;
    }
  >();

  for (const event of batch) {
    const queue = OtelIngestionQueue.getInstance({
      shardingKey: `${event.authCheck.scope.projectId}-${event.data.fileKey}`,
    });

    if (!queue) {
      throw new Error("Failed to get queue");
    }

    queues.add(queue);

    const existing = jobsByQueue.get(queue.name);
    const nextJob: {
      name: QueueJobs.OtelIngestionJob;
      data: TQueueJobTypes[QueueName.OtelIngestionQueue];
    } = {
      name: QueueJobs.OtelIngestionJob,
      data: {
        payload:
          event as TQueueJobTypes[QueueName.OtelIngestionQueue]["payload"],
        id: randomUUID(),
        timestamp: new Date(),
        name: QueueJobs.OtelIngestionJob,
      },
    };

    if (existing) {
      existing.jobs.push(nextJob);
    } else {
      jobsByQueue.set(queue.name, {
        queue,
        jobs: [nextJob],
      });
    }
  }

  await Promise.all(
    Array.from(jobsByQueue.values()).map(({ queue, jobs }) =>
      queue.addBulk(jobs),
    ),
  );

  // Log progress
  console.log(
    `✅ Added OTEL batch ${batchNumber} (${processedEvents + batch.length} events) to queue`,
  );

  // Log sample event from each batch for tracking
  if (batch.length > 0) {
    console.log(`📄 Sample OTEL event from batch: ${JSON.stringify(batch[0])}`);
  }
}

// Main execution
async function main() {
  try {
    const inputPath = path.resolve(INPUT_FILE);
    const outputPath = path.resolve(OUTPUT_FILE);
    const jsonlOutputPath = path.resolve(JSONL_OUTPUT_FILE);
    const otelJsonlOutputPath = path.resolve(OTEL_JSONL_OUTPUT_FILE);

    console.log(`📂 Input file: ${inputPath}`);
    console.log(`📂 Output file: ${outputPath}`);
    console.log(`📂 JSONL output file: ${jsonlOutputPath}`);
    console.log(`📂 OTEL JSONL output file: ${otelJsonlOutputPath}`);

    // Step 1: Filter the CSV file
    await filterCsvFile(inputPath, outputPath);

    console.log("\n✅ CSV filtering completed successfully!");

    // Step 2: Convert filtered CSV to JSONL
    await convertCsvToJsonl(outputPath, jsonlOutputPath, otelJsonlOutputPath);

    console.log("\n✅ JSONL conversion completed successfully!");

    // Step 3: Ingest events to BullMQ
    await ingestEventsToQueue(jsonlOutputPath);

    await ingestEventsToOtelQueue(otelJsonlOutputPath);

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
