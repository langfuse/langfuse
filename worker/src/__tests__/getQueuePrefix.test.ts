import { describe, test, expect, beforeEach, afterAll } from "vitest";
import { getQueuePrefix } from "@langfuse/shared/src/server";

// Import env by resolving the actual filesystem path, bypassing the package
// exports map. This ensures we get the same env object that redis.js uses
// internally via its relative "../../env" import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");
const envPath = path.resolve(
  __dirname,
  "../../node_modules/@langfuse/shared/dist/src/env.js",
);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require(envPath);

describe("getQueuePrefix", () => {
  const origPrefix = env.REDIS_KEY_PREFIX;
  const origCluster = env.REDIS_CLUSTER_ENABLED;

  beforeEach(() => {
    // Restore original env values
    env.REDIS_KEY_PREFIX = origPrefix;
    env.REDIS_CLUSTER_ENABLED = origCluster;
  });

  afterAll(() => {
    env.REDIS_KEY_PREFIX = origPrefix;
    env.REDIS_CLUSTER_ENABLED = origCluster;
  });

  test("returns undefined when no prefix and not in cluster mode", () => {
    env.REDIS_KEY_PREFIX = undefined;
    env.REDIS_CLUSTER_ENABLED = "false";

    const result = getQueuePrefix("TestQueue");
    expect(result).toBeUndefined();
  });

  test("returns hash-tagged queue name in cluster mode without prefix", () => {
    env.REDIS_KEY_PREFIX = undefined;
    env.REDIS_CLUSTER_ENABLED = "true";

    const result = getQueuePrefix("TestQueue");
    expect(result).toBe("{TestQueue}");
  });

  test("returns prefix in non-cluster mode with prefix set", () => {
    env.REDIS_KEY_PREFIX = "langfuse";
    env.REDIS_CLUSTER_ENABLED = "false";

    const result = getQueuePrefix("TestQueue");
    expect(result).toBe("langfuse");
  });

  test("returns hash-tagged prefix:queue in cluster mode with prefix set", () => {
    env.REDIS_KEY_PREFIX = "langfuse";
    env.REDIS_CLUSTER_ENABLED = "true";

    const result = getQueuePrefix("TestQueue");
    expect(result).toBe("{langfuse:TestQueue}");
  });

  test("handles different queue names correctly", () => {
    env.REDIS_KEY_PREFIX = "test-prefix";
    env.REDIS_CLUSTER_ENABLED = "true";

    expect(getQueuePrefix("IngestionQueue")).toBe(
      "{test-prefix:IngestionQueue}",
    );
    expect(getQueuePrefix("TraceUpsert")).toBe("{test-prefix:TraceUpsert}");
    expect(getQueuePrefix("BatchExport")).toBe("{test-prefix:BatchExport}");
  });

  test("handles empty string prefix", () => {
    // In production, empty string env vars are stripped by removeEmptyEnvVariables
    // before Zod parsing, so REDIS_KEY_PREFIX="" becomes undefined. However, if
    // an empty string reaches getQueuePrefix, ?? treats it as a valid value.
    env.REDIS_KEY_PREFIX = "";
    env.REDIS_CLUSTER_ENABLED = "false";

    const result = getQueuePrefix("TestQueue");
    expect(result).toBe("");
  });

  test("handles null prefix as undefined", () => {
    env.REDIS_KEY_PREFIX = null;
    env.REDIS_CLUSTER_ENABLED = "false";

    const result = getQueuePrefix("TestQueue");
    expect(result).toBeUndefined();
  });
});
