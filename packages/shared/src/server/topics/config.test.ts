import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("DOCKER_BUILD", undefined);
  vi.stubEnv("LANGFUSE_TOPICS_ENABLED", undefined);
  vi.stubEnv("LANGFUSE_TOPICS_ENABLED_PROJECT_IDS", undefined);
  vi.stubEnv("LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Topics tracing allowlist", () => {
  it.each([undefined, "", " , "])(
    "disables tracing when its allowlist has no IDs: %s",
    async (value) => {
      vi.stubEnv("LANGFUSE_TOPICS_ENABLED_PROJECT_IDS", "project-a");
      vi.stubEnv("LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS", value);
      const { env } = await import("../../env.js");
      expect(env.LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS).toEqual([]);
    },
  );

  it("parses tracing IDs independently from the processing allowlist", async () => {
    vi.stubEnv("LANGFUSE_TOPICS_ENABLED_PROJECT_IDS", "project-a,project-b");
    vi.stubEnv(
      "LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS",
      " project-b, ,project-c ",
    );
    const { env } = await import("../../env.js");
    expect(env.LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS).toEqual([
      "project-b",
      "project-c",
    ]);
    expect(env.LANGFUSE_TOPICS_ENABLED_PROJECT_IDS).toEqual([
      "project-a",
      "project-b",
    ]);
  });
});

describe("Topics project allowlist", () => {
  it("stays disabled when Docker builds skip environment defaults", async () => {
    vi.stubEnv("DOCKER_BUILD", "1");
    const { isTopicsEnabled, isTopicsProjectEnabled } =
      await import("./config.js");
    expect(isTopicsEnabled()).toBe(false);
    expect(isTopicsProjectEnabled("project-a")).toBe(false);
  });

  it.each([undefined, "false"])(
    "keeps allowlisted projects disabled when the global switch is %s",
    async (value) => {
      vi.stubEnv("LANGFUSE_TOPICS_ENABLED", value);
      vi.stubEnv("LANGFUSE_TOPICS_ENABLED_PROJECT_IDS", "project-a");
      const { isTopicsEnabled, isTopicsProjectEnabled } =
        await import("./config.js");
      expect(isTopicsEnabled()).toBe(false);
      expect(isTopicsProjectEnabled("project-a")).toBe(false);
    },
  );

  it.each([undefined, ""])(
    "allows no projects when Topics is enabled and the allowlist is absent or empty: %s",
    async (value) => {
      vi.stubEnv("LANGFUSE_TOPICS_ENABLED", "true");
      vi.stubEnv("LANGFUSE_TOPICS_ENABLED_PROJECT_IDS", value);
      const { isTopicsEnabled, isTopicsProjectEnabled } =
        await import("./config.js");
      expect(isTopicsEnabled()).toBe(true);
      expect(isTopicsProjectEnabled("project-a")).toBe(false);
    },
  );

  it("enables explicitly listed projects using exact trimmed IDs", async () => {
    vi.stubEnv("LANGFUSE_TOPICS_ENABLED", "true");
    vi.stubEnv(
      "LANGFUSE_TOPICS_ENABLED_PROJECT_IDS",
      " project-a, ,project-b ",
    );
    const { isTopicsEnabled, isTopicsProjectEnabled } =
      await import("./config.js");
    expect(isTopicsEnabled()).toBe(true);
    expect(isTopicsProjectEnabled("project-a")).toBe(true);
    expect(isTopicsProjectEnabled("project-b")).toBe(true);
    expect(isTopicsProjectEnabled("project")).toBe(false);
    expect(isTopicsProjectEnabled("project-a-other")).toBe(false);
    expect(isTopicsProjectEnabled("")).toBe(false);
  });
});
