import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Topics project allowlist", () => {
  it("stays disabled when Docker builds skip environment defaults", async () => {
    vi.stubEnv("DOCKER_BUILD", "1");
    vi.stubEnv("LANGFUSE_TOPICS_ENABLED_PROJECT_IDS", undefined);
    const { isTopicsEnabled, isTopicsProjectEnabled } =
      await import("./config.js");
    expect(isTopicsEnabled()).toBe(false);
    expect(isTopicsProjectEnabled("project-a")).toBe(false);
  });

  it.each([undefined, ""])(
    "defaults to only the demo project when the environment variable is absent or empty: %s",
    async (value) => {
      vi.stubEnv("LANGFUSE_TOPICS_ENABLED_PROJECT_IDS", value);
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
      const { isTopicsEnabled, isTopicsProjectEnabled } =
        await import("./config.js");
      expect(isTopicsEnabled()).toBe(true);
      expect(
        isTopicsProjectEnabled("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a"),
      ).toBe(true);
      expect(isTopicsProjectEnabled("project-a")).toBe(false);
    },
  );

  it("enables explicitly listed projects in production using exact trimmed IDs", async () => {
    vi.stubEnv(
      "LANGFUSE_TOPICS_ENABLED_PROJECT_IDS",
      " project-a, ,project-b ",
    );
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTAUTH_URL", "https://example.com");
    const { isTopicsEnabled, isTopicsProjectEnabled } =
      await import("./config.js");
    expect(isTopicsEnabled()).toBe(true);
    expect(isTopicsProjectEnabled("project-a")).toBe(true);
    expect(isTopicsProjectEnabled("project-b")).toBe(true);
    expect(isTopicsProjectEnabled("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")).toBe(
      false,
    );
    expect(isTopicsProjectEnabled("project")).toBe(false);
    expect(isTopicsProjectEnabled("project-a-other")).toBe(false);
    expect(isTopicsProjectEnabled("")).toBe(false);
  });
});
