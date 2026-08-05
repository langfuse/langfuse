import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getDefaultInAppAgentSandboxProviderType", () => {
  // Vitest loads the developer's ../.env, so a provider configured for local
  // development must not be created while tests run. This must not depend on
  // NODE_ENV: a deployment that set NODE_ENV=test silently stripped the
  // in-app agent's sandbox tools.
  it("resolves to null under Vitest even when a provider is configured", async () => {
    vi.stubEnv("LANGFUSE_IN_APP_AGENT_SANDBOX_PROVIDER", "lambda-microvm");
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();

    const { getDefaultInAppAgentSandboxProviderType } =
      await import("./config.js");

    expect(getDefaultInAppAgentSandboxProviderType()).toBeNull();
  });
});
