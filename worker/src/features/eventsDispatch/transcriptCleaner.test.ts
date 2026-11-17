import { randomUUID } from "crypto";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getS3EventStorageClient,
  TRACE_BATCH_INPUT_PREFIX,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { EventsDispatchTranscriptCleaner } from "./transcriptCleaner";

// MinIO only stamps objects with the current time, so the test moves the
// retention window instead of the clock; a shifted clock breaks request signing.
const retention = vi.hoisted(() => ({ ms: 0 }));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  get TRACE_BATCH_INPUT_RETENTION_MS() {
    return retention.ms;
  },
}));

// The compiled @langfuse/shared reads its env through Node's require cache.
const sharedEnv = createRequire(import.meta.url)("@langfuse/shared/src/env")
  .env as { LANGFUSE_S3_LIST_MAX_KEYS: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("EventsDispatchTranscriptCleaner", () => {
  const originalPrefix = env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX;
  const originalMaxKeys = sharedEnv.LANGFUSE_S3_LIST_MAX_KEYS;
  const storage = getS3EventStorageClient(env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET);

  beforeEach(() => {
    env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX = `${originalPrefix}transcript-cleaner-test-${randomUUID()}/`;
    sharedEnv.LANGFUSE_S3_LIST_MAX_KEYS = 2;
  });

  afterEach(() => {
    env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX = originalPrefix;
    sharedEnv.LANGFUSE_S3_LIST_MAX_KEYS = originalMaxKeys;
  });

  const upload = (fileName: string) =>
    storage.uploadFile({
      fileName,
      fileType: "application/json",
      data: "{}",
    });

  it("deletes expired transcripts across list pages and keeps newer ones", async () => {
    const prefix = `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${TRACE_BATCH_INPUT_PREFIX}`;
    const expired = ["a1", "a2", "a3"].map((name) => `${prefix}${name}.json`);
    const fresh = `${prefix}b.json`;

    await Promise.all(expired.map(upload));
    // Object timestamps have one-second precision.
    await sleep(1_100);
    const cutoff = Date.now();
    await sleep(1_100);
    await upload(fresh);

    retention.ms = Date.now() - cutoff;
    await new EventsDispatchTranscriptCleaner().processBatch();

    const remaining = await storage.listFiles(prefix);
    expect(remaining.map((f) => f.file)).toEqual([fresh]);
  });
});
