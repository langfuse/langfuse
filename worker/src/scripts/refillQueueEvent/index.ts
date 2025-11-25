#!/usr/bin/env tsx

import * as fs from "fs";
import { randomUUID } from "crypto";
import { z } from "zod/v4";
import { getQueue, QueueName, QueueJobs } from "@langfuse/shared/src/server";
import { ProjectQueueEventSchema } from "@langfuse/shared/src/server";

// Configuration
const QUEUE_NAME = QueueName.ProjectDelete;
const EVENTS_FILE = "events.jsonl";
const BATCH_SIZE = 1000;

// Schema mapping for each queue type. Add new schemas as needed.
const QUEUE_SCHEMA_MAP = {
  [QueueName.ProjectDelete]: ProjectQueueEventSchema,
} as const;

// Job name mapping for each queue type. Add new jobs as needed.
const QUEUE_JOB_MAP = {
  [QueueName.ProjectDelete]: QueueJobs.ProjectDelete,
} as const;

// Type guard to check if queue name is supported
function isSupportedQueue(
  queueName: string,
): queueName is keyof typeof QUEUE_SCHEMA_MAP {
  return queueName in QUEUE_SCHEMA_MAP;
}

// Statistics interface
interface Stats {
  totalEvents: number;
  validEvents: number;
  invalidEvents: number;
  processedEvents: number;
  processingTimeMs: number;
}

/**
 * Parse configuration from environment variables and command line arguments
 */
function validateConfig() {
  if (!isSupportedQueue(QUEUE_NAME)) {
    const supportedQueues = Object.keys(QUEUE_SCHEMA_MAP).join(", ");
    throw new Error(
      `Unsupported queue: ${QUEUE_NAME}. Supported queues: ${supportedQueues}`,
    );
  }

  if (!fs.existsSync(EVENTS_FILE)) {
    throw new Error(`Events file not found: ${EVENTS_FILE}`);
  }

  console.log(`Configuration:`);
  console.log(`   Queue: ${QUEUE_NAME}`);
  console.log(`   Events file: ${EVENTS_FILE}`);
  console.log(`   Batch size: ${BATCH_SIZE}`);
}

/**
 * Read and parse events from JSONL file
 */
function readEventsFromFile(filePath: string): unknown[] {
  console.log(`Reading events from ${filePath}...`);

  const fileContent = fs.readFileSync(filePath, "utf8");
  const lines = fileContent
    .trim()
    .split("\n")
    .filter((line) => line.trim() !== "");

  const events: unknown[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      const event = JSON.parse(line);
      events.push(event);
    } catch (error) {
      console.warn(`Failed to parse JSON at line ${i + 1}: ${line}`);
      console.warn(`Error: ${(error as Error).message}`);
    }
  }

  console.log(`Read ${events.length} events from ${lines.length} lines`);
  return events;
}

/**
 * Validate events against the queue schema
 */
function validateEvents(
  events: unknown[],
  queueName: keyof typeof QUEUE_SCHEMA_MAP,
): { valid: unknown[]; invalid: unknown[] } {
  console.log(`=
 Validating events for queue: ${queueName}...`);

  const schema = QUEUE_SCHEMA_MAP[queueName];
  const valid: unknown[] = [];
  const invalid: unknown[] = [];

  for (const event of events) {
    try {
      schema.parse(event);
      valid.push(event);
    } catch (error) {
      console.warn(`Invalid event:`, JSON.stringify(event));
      if (error instanceof z.ZodError) {
        console.warn(`Validation errors:`, error.message);
      }
      invalid.push(event);
    }
  }

  console.log(`Valid events: ${valid.length}`);
  console.log(`Invalid events: ${invalid.length}`);

  return { valid, invalid };
}

/**
 * Process events and add them to the queue
 */
async function processEvents(
  events: unknown[],
  queueName: keyof typeof QUEUE_SCHEMA_MAP,
  batchSize: number,
): Promise<Stats> {
  console.log(`Processing ${events.length} events for queue: ${queueName}...`);

  const startTime = Date.now();
  const stats: Stats = {
    totalEvents: events.length,
    validEvents: events.length,
    invalidEvents: 0,
    processedEvents: 0,
    processingTimeMs: 0,
  };

  // Get queue instance
  const queue = getQueue(queueName);
  if (!queue) {
    throw new Error(`Failed to get queue instance for: ${queueName}`);
  }

  const jobName = QUEUE_JOB_MAP[queueName];
  console.log(`Connected to queue: ${queueName} (job: ${jobName})`);

  // Process events in batches
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);

    // Prepare jobs for bulk insertion
    const jobs = batch.map((event) => ({
      name: jobName,
      data: {
        payload: event,
        id: randomUUID(),
        timestamp: new Date(),
        name: jobName,
      },
    }));

    // Add batch to queue
    await queue.addBulk(jobs);

    stats.processedEvents += batch.length;

    // Log progress
    const batchNumber = Math.ceil((i + 1) / batchSize);
    const totalBatches = Math.ceil(events.length / batchSize);
    console.log(
      `Processed batch ${batchNumber}/${totalBatches} (${stats.processedEvents}/${events.length} events)`,
    );

    // Log sample event from first batch
    if (i === 0 && batch.length > 0) {
      console.log(`Sample event:`, JSON.stringify(batch[0], null, 2));
    }
  }

  // Close queue connection
  await queue.close();

  stats.processingTimeMs = Date.now() - startTime;
  return stats;
}

/**
 * Print final statistics
 */
function printStats(stats: Stats): void {
  console.log("=== Processing Complete ===");
  console.log(`Total events: ${stats.totalEvents.toLocaleString()}`);
  console.log(`Valid events: ${stats.validEvents.toLocaleString()}`);
  console.log(`Invalid events: ${stats.invalidEvents.toLocaleString()}`);
  console.log(`Processed events: ${stats.processedEvents.toLocaleString()}`);
  console.log(
    `Processing time: ${(stats.processingTimeMs / 1000).toFixed(1)} seconds`,
  );

  if (stats.processingTimeMs > 0) {
    const eventsPerSecond = Math.round(
      stats.processedEvents / (stats.processingTimeMs / 1000),
    );
    console.log(
      `Average speed: ${eventsPerSecond.toLocaleString()} events/second`,
    );
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  try {
    console.log("Starting refill queue event script...\n");

    // Parse configuration
    validateConfig();

    // Read events from file
    const rawEvents = readEventsFromFile(EVENTS_FILE);

    if (rawEvents.length === 0) {
      console.log("No events found in file. Exiting.");
      return;
    }

    // Validate events
    const { valid: validEvents, invalid: invalidEvents } = validateEvents(
      rawEvents,
      QUEUE_NAME,
    );

    if (validEvents.length === 0) {
      console.log("No valid events found. Exiting.");
      return;
    }

    // Process events
    const stats = await processEvents(validEvents, QUEUE_NAME, BATCH_SIZE);
    stats.invalidEvents = invalidEvents.length;

    // Print final statistics
    printStats(stats);

    console.log("Script completed successfully!");
  } catch (error) {
    console.error("Error:", (error as Error).message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}
