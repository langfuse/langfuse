// @vitest-environment jsdom

import type { PostHogConfig } from "posthog-js";

const { initMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: {
    init: initMock,
  },
}));

vi.mock("posthog-js/react", () => ({
  PostHogProvider: vi.fn(),
}));

describe("PostHog session replay privacy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    initMock.mockReset();
  });

  it("records regular UI text while masking input values", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "EU");

    await import("@/src/pages/_app");

    expect(initMock).toHaveBeenCalledTimes(1);
    const config = initMock.mock.calls[0]![1] as Partial<PostHogConfig>;
    expect(config.session_recording).toMatchObject({
      maskAllInputs: true,
      blockClass: "ph-no-capture",
    });
    expect(config.session_recording?.maskTextSelector).toBe(
      '[contenteditable="true"]',
    );
    expect(config.disable_session_recording).toBe(false);
  });

  // Stronger than disabling the recorder: the HIPAA region runs no product
  // analytics at all, so there is no PostHog client to record with. The wider
  // region gate lives in posthog-product-analytics-region.clienttest.ts.
  it("initializes no PostHog client in the HIPAA cloud region", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "HIPAA");

    await import("@/src/pages/_app");

    expect(initMock).not.toHaveBeenCalled();
  });

  it("disables session recording outside Langfuse Cloud", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "");

    await import("@/src/pages/_app");

    expect(initMock).toHaveBeenCalledTimes(1);
    const config = initMock.mock.calls[0]![1] as Partial<PostHogConfig>;
    expect(config.disable_session_recording).toBe(true);
  });
});
