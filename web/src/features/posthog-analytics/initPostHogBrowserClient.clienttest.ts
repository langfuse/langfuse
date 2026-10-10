import { afterEach, describe, expect, it, vi } from "vitest";

import { initPostHogBrowserClient } from "@/src/features/posthog-analytics/initPostHogBrowserClient";

const ORIGINAL_CLOUD_REGION = process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
const ORIGINAL_POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const ORIGINAL_POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

function restoreAnalyticsEnv() {
  if (ORIGINAL_CLOUD_REGION === undefined) {
    delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  } else {
    process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = ORIGINAL_CLOUD_REGION;
  }
  if (ORIGINAL_POSTHOG_KEY === undefined) {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  } else {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = ORIGINAL_POSTHOG_KEY;
  }
  if (ORIGINAL_POSTHOG_HOST === undefined) {
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  } else {
    process.env.NEXT_PUBLIC_POSTHOG_HOST = ORIGINAL_POSTHOG_HOST;
  }
}

function enableUsAnalyticsEnv() {
  process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
  process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://ph.example.com";
}

afterEach(() => {
  restoreAnalyticsEnv();
  vi.restoreAllMocks();
});

describe("initPostHogBrowserClient", () => {
  it("does not call init when product analytics config is missing", () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    const init = vi.fn();

    expect(initPostHogBrowserClient({ init })).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it("does not call init in the HIPAA region", () => {
    enableUsAnalyticsEnv();
    process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "HIPAA";
    const init = vi.fn();

    expect(initPostHogBrowserClient({ init })).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it("disables session recording when no cloud region is set", () => {
    delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://ph.example.com";
    const init = vi.fn();

    expect(initPostHogBrowserClient({ init })).toBe(true);
    expect(init).toHaveBeenCalledWith(
      "phc_test_key",
      expect.objectContaining({
        disable_session_recording: true,
      }),
    );
  });

  it("initializes posthog-js when config is present", () => {
    enableUsAnalyticsEnv();
    const init = vi.fn();

    expect(initPostHogBrowserClient({ init })).toBe(true);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      "phc_test_key",
      expect.objectContaining({
        api_host: "https://ph.example.com",
        autocapture: false,
        persistence: "cookie",
        disable_session_recording: false,
      }),
    );
  });

  it("swallows Firefox OperationError from getRandomValues and does not console.error", () => {
    enableUsAnalyticsEnv();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const operationError = new DOMException(
      "The operation failed for an operation-specific reason",
      "OperationError",
    );
    const init = vi.fn(() => {
      throw operationError;
    });

    expect(() => {
      expect(initPostHogBrowserClient({ init })).toBe(false);
    }).not.toThrow();
    expect(init).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
