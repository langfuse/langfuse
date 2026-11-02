import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseMcpRateLimitError,
  withMcpRateLimitWait,
} from "./mcpRateLimitWait";

function rateLimitPayload(retryAfterSeconds: number) {
  return {
    message: "Rate limit exceeded",
    code: "rate_limited" as const,
    details: {
      retryAfterSeconds,
      limit: 30,
      remaining: 0,
    },
  };
}

function rateLimitError(retryAfterSeconds: number) {
  return new Error(JSON.stringify(rateLimitPayload(retryAfterSeconds)));
}

describe("parseMcpRateLimitError", () => {
  it("parses a thrown Error whose message is the rate-limit JSON", () => {
    expect(parseMcpRateLimitError(rateLimitError(12))).toEqual({
      retryAfterSeconds: 12,
    });
  });

  it("parses the embedded Langfuse MCP init error shape", () => {
    const payload = JSON.stringify(rateLimitPayload(32));

    expect(
      parseMcpRateLimitError(`Failed to initialize Langfuse MCP: ${payload}`),
    ).toEqual({ retryAfterSeconds: 32 });
  });

  it("returns null for MCP invalid-argument and schema errors", () => {
    expect(
      parseMcpRateLimitError(
        new Error(
          "MCP error -32602: Invalid params: missing required parameter 'name'",
        ),
      ),
    ).toBeNull();
    expect(
      parseMcpRateLimitError(
        new Error(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32602, message: "Invalid params" },
            id: 1,
          }),
        ),
      ),
    ).toBeNull();
  });
});

describe("withMcpRateLimitWait", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sleeps the first retryAfterSeconds then succeeds", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError(3))
      .mockResolvedValueOnce("ok");

    const resultPromise = withMcpRateLimitWait({
      fn,
      logContext: { runId: "run-1" },
    });

    await vi.advanceTimersByTimeAsync(2_999);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("uses the later retryAfterSeconds on a second 429", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError(1))
      .mockRejectedValueOnce(rateLimitError(4))
      .mockResolvedValueOnce("ok");

    const resultPromise = withMcpRateLimitWait({
      fn,
      logContext: { runId: "run-1" },
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(3_999);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry an MCP invalid-argument error with the same arguments", async () => {
    const error = new Error(
      "MCP error -32602: Invalid params: missing required parameter 'name'",
    );
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withMcpRateLimitWait({
        fn,
        logContext: { runId: "run-1" },
      }),
    ).rejects.toBe(error);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fails immediately when retryAfterSeconds exceeds the remaining budget", async () => {
    const error = rateLimitError(60);
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withMcpRateLimitWait({
        fn,
        budgetMs: 5_000,
        logContext: { runId: "run-1" },
      }),
    ).rejects.toBe(error);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not hang when aborted during the wait", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const abortError = new Error("aborted");
    const fn = vi.fn().mockRejectedValue(rateLimitError(3));

    const resultPromise = withMcpRateLimitWait({
      fn,
      signal: controller.signal,
      logContext: { runId: "run-1" },
    });

    await vi.advanceTimersByTimeAsync(0);
    controller.abort(abortError);

    await expect(resultPromise).rejects.toBe(abortError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
