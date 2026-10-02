// @vitest-environment jsdom

/**
 * Product-analytics region gate (browser half).
 *
 * The HIPAA cloud region runs no Langfuse product analytics at all, so the
 * PostHog browser SDK must never be initialized there — not even when the
 * deployment carries a PostHog key/host. Every other deployment keeps its
 * current behaviour, which is what the positive cases below pin down.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { postHogInitMock } = vi.hoisted(() => ({
  postHogInitMock: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: {
    init: postHogInitMock,
  },
}));

vi.mock("posthog-js/react", () => ({
  PostHogProvider: vi.fn(),
}));

const importAppShell = async () => {
  vi.resetModules();
  await import("@/src/pages/_app");
};

// Every region that keeps product analytics, plus self-hosted (region unset).
const ANALYTICS_ENABLED_REGIONS: (string | undefined)[] = [
  "US",
  "EU",
  "JP",
  "STAGING",
  undefined,
];

describe("PostHog product analytics region gate", () => {
  beforeEach(() => {
    postHogInitMock.mockClear();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("never initializes PostHog in the HIPAA cloud region", async () => {
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "HIPAA");

    await importAppShell();

    expect(postHogInitMock).not.toHaveBeenCalled();
  });

  it.each(ANALYTICS_ENABLED_REGIONS)(
    "initializes PostHog in region %s",
    async (region) => {
      vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", region);

      await importAppShell();

      expect(postHogInitMock).toHaveBeenCalledTimes(1);
      expect(postHogInitMock).toHaveBeenCalledWith(
        "phc_test",
        expect.objectContaining({ api_host: "https://eu.i.posthog.com" }),
      );
    },
  );
});
