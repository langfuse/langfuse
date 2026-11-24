import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("DOCKER_BUILD", undefined);
  vi.stubEnv("LANGFUSE_TOPICS_ENABLED", undefined);
  vi.stubEnv(
    "LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS_EXPERIMENTAL",
    undefined,
  );
  vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "EU");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Topics tracing allowlist", () => {
  it.each([undefined, "", " , "])(
    "disables tracing when its allowlist has no IDs: %s",
    async (value) => {
      vi.stubEnv(
        "LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS_EXPERIMENTAL",
        value,
      );
      const { env } = await import("../../env.js");
      expect(
        env.LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS_EXPERIMENTAL,
      ).toEqual([]);
    },
  );

  it("parses tracing IDs as exact trimmed values", async () => {
    vi.stubEnv(
      "LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS_EXPERIMENTAL",
      " project-b, ,project-c ",
    );
    const { env } = await import("../../env.js");
    expect(
      env.LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS_EXPERIMENTAL,
    ).toEqual(["project-b", "project-c"]);
  });
});

describe("Topics deployment switch", () => {
  it("stays disabled when Docker builds skip environment defaults", async () => {
    vi.stubEnv("DOCKER_BUILD", "1");
    const { isTopicsEnabled } = await import("./config.js");
    expect(isTopicsEnabled()).toBe(false);
  });

  it.each([undefined, "false"])(
    "is disabled when LANGFUSE_TOPICS_ENABLED is %s",
    async (value) => {
      vi.stubEnv("LANGFUSE_TOPICS_ENABLED", value);
      const { isTopicsEnabled } = await import("./config.js");
      expect(isTopicsEnabled()).toBe(false);
    },
  );

  it("enables self-hosted instances without a cloud region", async () => {
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", undefined);
    vi.stubEnv("LANGFUSE_TOPICS_ENABLED", "true");
    const { isTopicsEnabled } = await import("./config.js");
    expect(isTopicsEnabled()).toBe(true);
  });
});
