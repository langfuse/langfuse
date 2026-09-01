import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Product-analytics region gate (server half).
 *
 * `ServerPosthog` is the single server-side entry point for Langfuse product
 * analytics (signup conversion, backend activity, self-host telemetry). In the
 * HIPAA cloud region it still constructs a `posthog-node` client, then opts it
 * out with `disable()` so capture becomes a no-op. That is enough on the
 * server: unlike the browser SDK, disable does not phone home.
 */

const {
  postHogConstructor,
  captureMock,
  disableMock,
  shutdownMock,
  flushMock,
} = vi.hoisted(() => ({
  postHogConstructor: vi.fn(),
  captureMock: vi.fn(),
  disableMock: vi.fn().mockResolvedValue(undefined),
  shutdownMock: vi.fn().mockResolvedValue(undefined),
  flushMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(...args: unknown[]) {
      postHogConstructor(...args);
    }
    capture = (...args: unknown[]) => {
      if (disableMock.mock.calls.length > 0) return;
      captureMock(...args);
    };
    disable = disableMock;
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
    disableMock.mockClear();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("disables the client in the HIPAA cloud region so capture is a no-op", async () => {
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "HIPAA");

    const posthog = await loadServerPosthog();
    posthog.capture(captureArgs);
    await posthog.flush();
    await posthog.shutdown();

    expect(postHogConstructor).toHaveBeenCalledTimes(1);
    expect(disableMock).toHaveBeenCalledTimes(1);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("still disables the HIPAA client when it is built from the telemetry fallback", async () => {
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "HIPAA");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", undefined);

    const posthog = await loadServerPosthog();
    posthog.capture(captureArgs);

    expect(postHogConstructor).toHaveBeenCalledTimes(1);
    expect(disableMock).toHaveBeenCalledTimes(1);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it.each([["US"], ["EU"], ["JP"]])("keeps capturing in %s", async (region) => {
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", region);

    const posthog = await loadServerPosthog();
    posthog.capture(captureArgs);

    expect(postHogConstructor).toHaveBeenCalledTimes(1);
    expect(disableMock).not.toHaveBeenCalled();
    expect(captureMock).toHaveBeenCalledWith(captureArgs);
  });
});
