import { type ErrorEvent } from "@sentry/nextjs";

import { isNoisyHttpClientPollEvent } from "@/src/utils/sentryFilters";

/**
 * Build an event shaped exactly like the ones `httpClientIntegration` emits:
 * message + a single exception value carrying the
 * `auto.http.client.<fetch|xhr>` mechanism, plus `request.url`.
 */
function httpClientEvent(
  url: string,
  status = 500,
  type: "fetch" | "xhr" = "fetch",
): ErrorEvent {
  const message = `HTTP Client Error with status code: ${status}`;
  return {
    message,
    exception: {
      values: [
        {
          type: "Error",
          value: message,
          mechanism: { type: `auto.http.client.${type}`, handled: false },
        },
      ],
    },
    request: { url, method: "GET" },
    contexts: { response: { status_code: status } },
  } as ErrorEvent;
}

describe("isNoisyHttpClientPollEvent", () => {
  describe("drops expected poll/health 5xx from httpClientIntegration", () => {
    it("drops the NextAuth session poll (fetch)", () => {
      expect(
        isNoisyHttpClientPollEvent(
          httpClientEvent("https://cloud.langfuse.com/api/auth/session", 500),
        ),
      ).toBe(true);
    });

    it("drops the NextAuth session poll (xhr)", () => {
      expect(
        isNoisyHttpClientPollEvent(
          httpClientEvent(
            "https://cloud.langfuse.com/api/auth/session",
            502,
            "xhr",
          ),
        ),
      ).toBe(true);
    });

    it("drops the session poll behind a NEXT_PUBLIC_BASE_PATH prefix", () => {
      expect(
        isNoisyHttpClientPollEvent(
          httpClientEvent(
            "https://example.com/self-hosted/api/auth/session",
            504,
          ),
        ),
      ).toBe(true);
    });

    it("drops the session poll even with a query string", () => {
      expect(
        isNoisyHttpClientPollEvent(
          httpClientEvent(
            "https://cloud.langfuse.com/api/auth/session?foo=bar",
            500,
          ),
        ),
      ).toBe(true);
    });

    it("drops the health and readiness probes", () => {
      expect(
        isNoisyHttpClientPollEvent(
          httpClientEvent("https://cloud.langfuse.com/api/public/health", 503),
        ),
      ).toBe(true);
      expect(
        isNoisyHttpClientPollEvent(
          httpClientEvent("https://cloud.langfuse.com/api/public/ready", 500),
        ),
      ).toBe(true);
    });
  });

  describe("KEEPS genuine 5xx on real endpoints (does not mask real errors)", () => {
    it("keeps a tRPC 5xx", () => {
      expect(
        isNoisyHttpClientPollEvent(
          httpClientEvent(
            "https://cloud.langfuse.com/api/trpc/traces.all?batch=1",
            500,
          ),
        ),
      ).toBe(false);
    });

    it("keeps a public API 5xx (ingestion / traces)", () => {
      expect(
        isNoisyHttpClientPollEvent(
          httpClientEvent(
            "https://cloud.langfuse.com/api/public/ingestion",
            500,
          ),
        ),
      ).toBe(false);
      expect(
        isNoisyHttpClientPollEvent(
          httpClientEvent("https://cloud.langfuse.com/api/public/traces", 502),
        ),
      ).toBe(false);
    });

    it("keeps other /api/auth endpoints (only /session is a poll)", () => {
      expect(
        isNoisyHttpClientPollEvent(
          httpClientEvent("https://cloud.langfuse.com/api/auth/callback", 500),
        ),
      ).toBe(false);
    });

    it("does not match a path that merely contains a noise path as a substring", () => {
      // endsWith on the pathname, so `/api/auth/sessionmanager` must NOT match.
      expect(
        isNoisyHttpClientPollEvent(
          httpClientEvent(
            "https://cloud.langfuse.com/api/auth/sessionmanager",
            500,
          ),
        ),
      ).toBe(false);
    });
  });

  describe("never touches non-httpClient events", () => {
    it("keeps a genuine thrown exception even if its URL looks like a poll endpoint", () => {
      const event = {
        exception: {
          values: [
            {
              type: "TypeError",
              value: "Cannot read properties of undefined",
              mechanism: { type: "onunhandledrejection", handled: false },
            },
          ],
        },
        request: { url: "https://cloud.langfuse.com/api/auth/session" },
      } as ErrorEvent;
      expect(isNoisyHttpClientPollEvent(event)).toBe(false);
    });

    it("keeps an event with no exception/mechanism (e.g. a message event)", () => {
      const event = {
        message: "some message",
        request: { url: "https://cloud.langfuse.com/api/auth/session" },
      } as ErrorEvent;
      expect(isNoisyHttpClientPollEvent(event)).toBe(false);
    });

    it("keeps an httpClient event that has no request url", () => {
      const event = {
        exception: {
          values: [
            {
              type: "Error",
              value: "HTTP Client Error with status code: 500",
              mechanism: { type: "auto.http.client.fetch", handled: false },
            },
          ],
        },
      } as ErrorEvent;
      expect(isNoisyHttpClientPollEvent(event)).toBe(false);
    });
  });
});
