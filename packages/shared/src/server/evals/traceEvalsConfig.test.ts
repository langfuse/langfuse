import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("trace evals project allowlist", () => {
  it("enables only listed projects, only on Langfuse Cloud, independent of the Topics list", async () => {
    vi.stubEnv("DOCKER_BUILD", undefined);
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "EU");
    vi.stubEnv("LANGFUSE_TOPICS_ENABLED", "true");
    vi.stubEnv("LANGFUSE_TOPICS_ENABLED_PROJECT_IDS", "topics-project");
    vi.stubEnv(
      "LANGFUSE_TRACE_EVALS_ENABLED_PROJECT_IDS",
      " project-a, ,project-b ",
    );
    const { isTraceEvalsProjectEnabled } =
      await import("./traceEvalsConfig.js");
    expect(isTraceEvalsProjectEnabled("project-a")).toBe(true);
    expect(isTraceEvalsProjectEnabled("project-b")).toBe(true);
    expect(isTraceEvalsProjectEnabled("topics-project")).toBe(false);
    expect(isTraceEvalsProjectEnabled("project")).toBe(false);

    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", undefined);
    const selfHosted = await import("./traceEvalsConfig.js");
    expect(selfHosted.isTraceEvalsProjectEnabled("project-a")).toBe(false);
  });
});
