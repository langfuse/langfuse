import { isInAppAgentRateLimited } from "@/src/features/in-app-agent/fns/isInAppAgentRateLimited";
import { getInAppAgentError } from "./getInAppAgentError";

describe("getInAppAgentError", () => {
  const now = new Date("2026-07-08T20:00:54.997Z").getTime();
  const rateLimitError = {
    message: "Rate limit exceeded",
    code: "rate_limited",
    details: {
      retryAfterSeconds: 12,
      limit: 30,
      remaining: 0,
      resetAt: "2026-07-08T20:01:06.997Z",
    },
  };

  it("extracts a rate limit from a streamed MCP error", () => {
    expect(
      getInAppAgentError(
        {
          message: `Failed to initialize Langfuse MCP: Streamable HTTP error: Error POSTing to endpoint: ${JSON.stringify(rateLimitError)}`,
        },
        now,
      ),
    ).toEqual({
      type: "rate_limit",
      retryAt: now + 12_000,
    });
  });

  it("extracts a rate limit from a direct HTTP error payload", () => {
    expect(getInAppAgentError({ payload: rateLimitError }, now)).toEqual({
      type: "rate_limit",
      retryAt: now + 12_000,
    });
  });

  it("checks rate limits against the current time", () => {
    const error = getInAppAgentError({ payload: rateLimitError }, now);

    expect(isInAppAgentRateLimited(error, now + 11_999)).toBe(true);
    expect(isInAppAgentRateLimited(error, now + 12_000)).toBe(false);
  });

  it("preserves unrelated errors as generic errors", () => {
    expect(
      getInAppAgentError({ message: "Assistant connection failed" }, now),
    ).toEqual({
      type: "generic",
      message: "Assistant connection failed",
    });
  });

  it("does not classify malformed embedded JSON as a rate limit", () => {
    const message = 'Failed to initialize Langfuse MCP: {"code":"rate_limited"';

    expect(getInAppAgentError({ message }, now)).toEqual({
      type: "generic",
      message,
    });
  });
});
