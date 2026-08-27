import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Product-analytics region gate (server half).
 *
 * `ServerPosthog` is the single server-side entry point for Langfuse product
 * analytics (signup conversion, backend activity, self-host telemetry). In the
 * HIPAA cloud region it must never construct a PostHog client, so no capture
 * from any of those call sites can leave the deployment.
 */

const { postHogConstructor, captureMock, shutdownMock, flushMock } = vi.hoisted(
  () => ({
    postHogConstructor: vi.fn(),
    captureMock: vi.fn(),
    shutdownMock: vi.fn().mockResolvedValue(undefined),
    flushMock: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(...args: unknown[]) {
      postHogConstructor(...args);
    }
    capture = captureMock;
    shutdown = shutdownMock;
    flush = flushMock;
    debug = vi.fn();
  },
}));

const loadServerPosthog = async () => {
  vi.resetModules();
  const { ServerPosthog } =
    await import("@/src/features/posthog-analytics/ServerPosthog");
  return new ServerPosthog();
};

const captureArgs = {
  distinctId: "user-1",
  event: "backend:activity",
} as const;

describe("ServerPosthog product analytics region gate", () => {
  beforeEach(() => {
    postHogConstructor.mockClear();
    captureMock.mockClear();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("captures nothing in the HIPAA cloud region", async () => {
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "HIPAA");

    const posthog = await loadServerPosthog();
    posthog.capture(captureArgs);
    await posthog.flush();
    await posthog.shutdown();

    expect(postHogConstructor).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("falls back to no client in HIPAA even when telemetry defaults would apply", async () => {
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "HIPAA");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", undefined);

    const posthog = await loadServerPosthog();
    posthog.capture(captureArgs);

    expect(postHogConstructor).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it.each([["US"], ["EU"], ["JP"]])("keeps capturing in %s", async (region) => {
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", region);

    const posthog = await loadServerPosthog();
    posthog.capture(captureArgs);

    expect(postHogConstructor).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith(captureArgs);
  });
});
