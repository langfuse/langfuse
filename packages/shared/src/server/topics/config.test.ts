import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("DOCKER_BUILD", undefined);
  vi.stubEnv(
    "LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS_EXPERIMENTAL",
    undefined,
  );
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
