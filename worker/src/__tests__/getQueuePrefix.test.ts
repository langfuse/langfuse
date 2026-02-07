import { describe, test, expect, beforeEach, vi } from "vitest";
import { getQueuePrefix } from "@langfuse/shared/src/server";

// Mock the env module
vi.mock("@langfuse/shared/src/env", () => ({
  env: {
    REDIS_KEY_PREFIX: undefined as string | undefined,
    REDIS_CLUSTER_ENABLED: "false" as "true" | "false",
  },
}));

describe("getQueuePrefix", () => {
  beforeEach(async () => {
    // Reset mocks before each test
    const { env } = await import("@langfuse/shared/src/env");
    env.REDIS_KEY_PREFIX = undefined;
    env.REDIS_CLUSTER_ENABLED = "false";
  });

  test("returns undefined when no prefix and not in cluster mode", async () => {
    const result = getQueuePrefix("TestQueue");
    expect(result).toBeUndefined();
  });

  test("returns hash-tagged queue name in cluster mode without prefix", async () => {
    const { env } = await import("@langfuse/shared/src/env");
    env.REDIS_CLUSTER_ENABLED = "true";

    const result = getQueuePrefix("TestQueue");
    expect(result).toBe("{TestQueue}");
  });

  test("returns prefix in non-cluster mode with prefix set", async () => {
    const { env } = await import("@langfuse/shared/src/env");
    env.REDIS_KEY_PREFIX = "langfuse";

    const result = getQueuePrefix("TestQueue");
    expect(result).toBe("langfuse");
  });

  test("returns hash-tagged prefix:queue in cluster mode with prefix set", async () => {
    const { env } = await import("@langfuse/shared/src/env");
    env.REDIS_KEY_PREFIX = "langfuse";
    env.REDIS_CLUSTER_ENABLED = "true";

    const result = getQueuePrefix("TestQueue");
    expect(result).toBe("{langfuse:TestQueue}");
  });

  test("handles different queue names correctly", async () => {
    const { env } = await import("@langfuse/shared/src/env");
    env.REDIS_KEY_PREFIX = "test-prefix";
    env.REDIS_CLUSTER_ENABLED = "true";

    expect(getQueuePrefix("IngestionQueue")).toBe(
      "{test-prefix:IngestionQueue}",
    );
    expect(getQueuePrefix("TraceUpsert")).toBe("{test-prefix:TraceUpsert}");
    expect(getQueuePrefix("BatchExport")).toBe("{test-prefix:BatchExport}");
  });

  test("handles empty string prefix as undefined", async () => {
    const { env } = await import("@langfuse/shared/src/env");
    env.REDIS_KEY_PREFIX = "";

    const result = getQueuePrefix("TestQueue");
    expect(result).toBeUndefined();
  });

  test("handles null prefix as undefined", async () => {
    const { env } = await import("@langfuse/shared/src/env");
    env.REDIS_KEY_PREFIX = null as any;

    const result = getQueuePrefix("TestQueue");
    expect(result).toBeUndefined();
  });
});
