#!/usr/bin/env node

/* eslint-disable turbo/no-undeclared-env-vars */

/**
 * Standalone replay script for Langfuse ingestion events.
 * Reads S3 keys from a CSV (exported from Athena) and sends them
 * in batches to POST /api/admin/ingestion-replay.
 *
 * Usage:
 *   LANGFUSE_HOST=https://cloud.langfuse.com \
 *   ADMIN_API_KEY=your-key \
 *   npx tsx replay.ts --file events.csv
 *
 * No monorepo dependencies — only Node.js built-ins + global fetch.
 */

import {
  createReadStream,
  readFileSync,
  writeFileSync,
  existsSync,
  appendFileSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    file: { type: "string", default: "events.csv" },
    "batch-size": { type: "string", default: "500" },
    concurrency: { type: "string", default: "4" },
    "rate-limit": { type: "string", default: "50" },
    "dry-run": { type: "boolean", default: false },
    resume: { type: "boolean", default: false },
  },
  strict: true,
});

const FILE = resolve(args.file!);
const BATCH_SIZE = parseInt(args["batch-size"]!, 10);
const CONCURRENCY = parseInt(args.concurrency!, 10);
const RATE_LIMIT = parseInt(args["rate-limit"]!, 10);
const DRY_RUN = args["dry-run"]!;
const RESUME = args.resume!;

// ---------------------------------------------------------------------------
// Env vars
// ---------------------------------------------------------------------------

const LANGFUSE_HOST = process.env.LANGFUSE_HOST;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

if (!LANGFUSE_HOST) {
  console.error("Error: LANGFUSE_HOST environment variable is required");
  process.exit(1);
}
if (!ADMIN_API_KEY) {
  console.error("Error: ADMIN_API_KEY environment variable is required");
  process.exit(1);
}

const API_URL = `${LANGFUSE_HOST.replace(/\/+$/, "")}/api/admin/ingestion-replay`;

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------

const CHECKPOINT_FILE = `${FILE}.checkpoint`;
const ERRORS_FILE = resolve(dirname(FILE), `errors.csv`);

function readCheckpoint(): number {
  if (!RESUME || !existsSync(CHECKPOINT_FILE)) return 0;
  const content = readFileSync(CHECKPOINT_FILE, "utf-8").trim();
  const offset = parseInt(content, 10);
  return isNaN(offset) ? 0 : offset;
}

function writeCheckpoint(offset: number): void {
  writeFileSync(CHECKPOINT_FILE, String(offset), "utf-8");
}

function appendErrors(keys: string[]): void {
  const lines = keys.map((k) => `"${k.replace(/"/g, '""')}"\n`).join("");
  appendFileSync(ERRORS_FILE, lines, "utf-8");
}

// ---------------------------------------------------------------------------
// CSV parsing — extract `key` column
// ---------------------------------------------------------------------------

function parseCSVField(field: string): string {
  const trimmed = field.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return trimmed;
}

async function readKeys(): Promise<string[]> {
  const keys: string[] = [];
  const rl = createInterface({
    input: createReadStream(FILE, "utf-8"),
    crlfDelay: Infinity,
  });

  let headerParsed = false;
  let keyIndex = -1;
  const startOffset = readCheckpoint();
  let rowNumber = 0;

  for await (const line of rl) {
    if (!headerParsed) {
      const headers = line.split(",").map(parseCSVField);
      keyIndex = headers.findIndex((h) => h.toLowerCase() === "key");
      if (keyIndex === -1) {
        console.error(
          `Error: CSV must have a "key" column. Found headers: ${headers.join(", ")}`,
        );
        process.exit(1);
      }
      headerParsed = true;
      continue;
    }

    rowNumber++;
    if (rowNumber <= startOffset) continue;

    const fields = splitCSVLine(line);
    const key = parseCSVField(fields[keyIndex] ?? "");
    if (key) keys.push(key);
  }

  return keys;
}

/**
 * Split a CSV line respecting quoted fields.
 */
function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  fields.push(current);
  return fields;
}

// ---------------------------------------------------------------------------
// Rate limiter (token bucket)
// ---------------------------------------------------------------------------

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private readonly rate: number) {
    this.tokens = rate;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      // Wait until at least one token is available
      const waitMs = Math.ceil(1000 / this.rate);
      await sleep(waitMs);
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = (elapsed / 1000) * this.rate;
    this.tokens = Math.min(this.rate, this.tokens + newTokens);
    this.lastRefill = now;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Semaphore for concurrency control
// ---------------------------------------------------------------------------

class Semaphore {
  private waiting: Array<() => void> = [];
  private count: number;

  constructor(private readonly max: number) {
    this.count = max;
  }

  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return;
    }
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.count++;
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP client with retries
// ---------------------------------------------------------------------------

interface ReplayResponse {
  queued: number;
  skipped: number;
  errors: string[];
}

async function sendBatch(keys: string[]): Promise<ReplayResponse> {
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ keys }),
    });

    if (resp.ok) {
      return (await resp.json()) as ReplayResponse;
    }

    // Retry on 429 and 5xx
    if (resp.status === 429 || resp.status >= 500) {
      if (attempt < maxRetries) {
        const baseDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        const delay = baseDelay + jitter;
        console.warn(
          `  Retry ${attempt + 1}/${maxRetries} after ${resp.status} (waiting ${Math.round(delay)}ms)`,
        );
        await sleep(delay);
        continue;
      }
    }

    // Non-retryable error or exhausted retries
    const body = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }

  // Should not reach here
  throw new Error("Exhausted retries");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Replay ingestion events`);
  console.log(`  File:        ${FILE}`);
  console.log(`  Batch size:  ${BATCH_SIZE}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Rate limit:  ${RATE_LIMIT} req/s`);
  console.log(`  Dry run:     ${DRY_RUN}`);
  console.log(`  Resume:      ${RESUME}`);
  console.log(`  API URL:     ${API_URL}`);
  console.log();

  const keys = await readKeys();
  const totalKeys = keys.length;

  if (totalKeys === 0) {
    console.log("No keys to process.");
    return;
  }

  console.log(`Loaded ${totalKeys} keys to replay.`);
  if (DRY_RUN) {
    console.log("Dry run — no requests will be sent.");
    console.log(`Would send ${Math.ceil(totalKeys / BATCH_SIZE)} batches.`);
    return;
  }

  const startOffset = readCheckpoint();
  const bucket = new TokenBucket(RATE_LIMIT);
  const semaphore = new Semaphore(CONCURRENCY);

  let totalQueued = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let processedKeys = 0;
  const batches: string[][] = [];

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    batches.push(keys.slice(i, i + BATCH_SIZE));
  }

  const promises: Promise<void>[] = [];

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]!;
    const batchNumber = batchIdx + 1;

    await semaphore.acquire();
    await bucket.acquire();

    const promise = (async () => {
      try {
        const result = await sendBatch(batch);
        totalQueued += result.queued;
        totalSkipped += result.skipped;

        if (result.errors.length > 0) {
          totalErrors += result.errors.length;
          console.warn(
            `  Batch ${batchNumber}: ${result.errors.length} errors`,
          );
        }
      } catch (err) {
        totalErrors += batch.length;
        appendErrors(batch);
        console.error(
          `  Batch ${batchNumber} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        processedKeys += batch.length;
        const pct = ((processedKeys / totalKeys) * 100).toFixed(1);
        const currentRow = startOffset + processedKeys;
        console.log(
          `[${currentRow}/${startOffset + totalKeys}] ${pct}% — ${totalQueued} queued, ${totalSkipped} skipped`,
        );
        writeCheckpoint(currentRow);
        semaphore.release();
      }
    })();

    promises.push(promise);
  }

  await Promise.all(promises);

  console.log();
  console.log(`Done.`);
  console.log(`  Queued:  ${totalQueued}`);
  console.log(`  Skipped: ${totalSkipped}`);
  console.log(`  Errors:  ${totalErrors}`);

  if (totalErrors > 0) {
    console.log(`  See ${ERRORS_FILE} for failed keys.`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
