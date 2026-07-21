import { type ErrorEvent } from "@sentry/nextjs";

import {
  isDenylistedNoiseEvent,
  isNoisyHttpClientPollEvent,
  isReactDevtoolsInternalEvent,
} from "@/src/utils/sentryFilters";

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

/**
 * Build an event carrying a single exception value (type + value), the shape
 * `captureConsoleIntegration` / global error handlers emit.
 */
function exceptionEvent(value: string, type = "Error"): ErrorEvent {
  return {
    exception: {
      values: [{ type, value, mechanism: { type: "generic", handled: false } }],
    },
  } as ErrorEvent;
}

/**
 * Build the shape `captureConsoleIntegration` produces for a string
 * `console.error(...)` with `attachStacktrace` unset (the default): a MESSAGE
 * event with `event.message` and NO `event.exception`. This is how the biggest
 * console-origin families (NextAuth CLIENT_FETCH_ERROR, PostHog notices, the
 * Next.js `_error.js` artifact) actually reach `beforeSend` in production.
 */
function messageEvent(message: string): ErrorEvent {
  return { message } as ErrorEvent;
}

/** Same, but the text lives on `event.logentry.message` (defensive fallback). */
function logentryEvent(message: string): ErrorEvent {
  return { logentry: { message } } as ErrorEvent;
}

describe("isDenylistedNoiseEvent", () => {
  describe("A. drops browser/transport failures (whole-message match)", () => {
    it("drops Chrome 'Failed to fetch'", () => {
      expect(isDenylistedNoiseEvent(exceptionEvent("Failed to fetch"))).toBe(
        true,
      );
    });

    it("drops Chrome 'Failed to fetch (hostname)' (trailing parenthetical)", () => {
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent("Failed to fetch (cloud.langfuse.com)"),
        ),
      ).toBe(true);
      // also when wrapped by TRPCClientError
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            "TRPCClientError: Failed to fetch (cloud.langfuse.com)",
          ),
        ),
      ).toBe(true);
    });

    it("drops Firefox 'NetworkError when attempting to fetch resource' (with trailing period)", () => {
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent("NetworkError when attempting to fetch resource."),
        ),
      ).toBe(true);
    });

    it("drops Safari/WebKit 'Load failed'", () => {
      expect(isDenylistedNoiseEvent(exceptionEvent("Load failed"))).toBe(true);
    });

    it("drops the transport failure when wrapped by TRPCClientError", () => {
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent("TRPCClientError: Failed to fetch"),
        ),
      ).toBe(true);
    });

    it("drops Response.json() on a non-JSON body", () => {
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            "Failed to execute 'json' on 'Response': Unexpected end of JSON input",
          ),
        ),
      ).toBe(true);
    });

    it("drops an HTML error page parsed as JSON (json-parse signature + <html)", () => {
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            `Unexpected token '<', "<html>\n<head>"... is not valid JSON`,
            "SyntaxError",
          ),
        ),
      ).toBe(true);
    });
  });

  describe("B. drops NextAuth session-poll CLIENT_FETCH_ERROR", () => {
    // NextAuth logs a STRING via console.error, so this arrives as a MESSAGE
    // event (no exception) — the shape captureConsoleIntegration produces.
    it("drops the [next-auth][error][CLIENT_FETCH_ERROR] log (message event)", () => {
      expect(
        isDenylistedNoiseEvent(
          messageEvent(
            "[next-auth][error][CLIENT_FETCH_ERROR] https://cloud.langfuse.com/api/auth/session Failed to fetch",
          ),
        ),
      ).toBe(true);
    });

    it("drops it when the text lives on event.logentry.message", () => {
      expect(
        isDenylistedNoiseEvent(
          logentryEvent(
            "[next-auth][error][CLIENT_FETCH_ERROR] https://cloud.langfuse.com/api/auth/session Load failed",
          ),
        ),
      ).toBe(true);
    });
  });

  describe("C. drops expected browser-benign / vendor artifacts", () => {
    it("drops a clipboard permission denial (NotAllowedError + writeText)", () => {
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            "Failed to execute 'writeText' on 'Clipboard': Write permission denied.",
            "NotAllowedError",
          ),
        ),
      ).toBe(true);
    });

    it("drops an intentional request cancellation (AbortError)", () => {
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent("signal is aborted without reason", "AbortError"),
        ),
      ).toBe(true);
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent("The operation was aborted.", "AbortError"),
        ),
      ).toBe(true);
    });

    // PostHog logs a string via console.error, so it arrives as a MESSAGE event
    // (captureConsoleIntegration) — assert against that production shape.
    it("drops a third-party [PostHog.js] notice (message event)", () => {
      expect(
        isDenylistedNoiseEvent(
          messageEvent("[PostHog.js] was already loaded elsewhere."),
        ),
      ).toBe(true);
    });

    it("drops the @sentry/nextjs '_error.js called with falsy error (…)' artifact", () => {
      // Real shape: captureException(`_error.js called with falsy error (${err})`)
      // → exception event whose value STARTS with the prefix.
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent("_error.js called with falsy error (undefined)"),
        ),
      ).toBe(true);
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent("_error.js called with falsy error (null)"),
        ),
      ).toBe(true);
    });
  });

  describe("A. transport failures also drop when they arrive as message events", () => {
    it("drops a message-event 'Failed to fetch'", () => {
      expect(isDenylistedNoiseEvent(messageEvent("Failed to fetch"))).toBe(
        true,
      );
    });

    it("drops a message-event HTML-parsed-as-JSON error", () => {
      expect(
        isDenylistedNoiseEvent(
          messageEvent(
            `Unexpected token '<', "<html>\n<head>"... is not valid JSON`,
          ),
        ),
      ).toBe(true);
    });
  });

  // The heart of the safety contract: prove that real / similar-looking errors
  // are NOT dropped. If any of these regress to `true`, a real bug would be
  // hidden from Sentry.
  describe("KEEPS real errors (never masks a genuine app error)", () => {
    it("keeps a real tRPC error carrying the server's message", () => {
      expect(
        isDenylistedNoiseEvent(exceptionEvent("TRPCClientError: UNAUTHORIZED")),
      ).toBe(false);
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            "TRPCClientError: You are not a member of this organization",
          ),
        ),
      ).toBe(false);
    });

    it("keeps an app error that merely QUOTES a transport phrase", () => {
      // Real messages seen in the codebase — must survive.
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            "Failed to fetch created model",
            "InvalidRequestError",
          ),
        ),
      ).toBe(false);
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            "Failed to fetch channels. Please check your Slack connection and try again.",
          ),
        ),
      ).toBe(false);
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent("Load failed for dataset export job 42"),
        ),
      ).toBe(false);
      // Ends in a parenthetical, but the non-parenthetical part is longer than a
      // bare transport phrase, so stripping the trailing `(…)` still leaves a
      // non-matching whole message — must survive.
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent("Failed to fetch traces (batch 3 of 5)"),
        ),
      ).toBe(false);
    });

    it("keeps a genuine SyntaxError with no <html (not an HTML-as-JSON artifact)", () => {
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent("Unexpected end of JSON input", "SyntaxError"),
        ),
      ).toBe(false);
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            `Unexpected token 'x', "xyz" is not valid JSON`,
            "SyntaxError",
          ),
        ),
      ).toBe(false);
    });

    it("keeps the chunk-load / stale-deploy SyntaxError (handled separately, not dropped)", () => {
      // Script parsing an HTML page: has `Unexpected token '<'` and `<html` but
      // NOT the JSON-parse `is not valid JSON` suffix, so A5 must not catch it.
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            "Unexpected token '<'\n<html><body>502 Bad Gateway</body></html>",
            "SyntaxError",
          ),
        ),
      ).toBe(false);
    });

    it("keeps a real thrown TypeError", () => {
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            "Cannot read properties of undefined (reading 'map')",
            "TypeError",
          ),
        ),
      ).toBe(false);
    });

    it("keeps a non-clipboard NotAllowedError (autoplay/fullscreen)", () => {
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            "play() failed because the user didn't interact with the document first",
            "NotAllowedError",
          ),
        ),
      ).toBe(false);
    });

    it("keeps the generic prod error-boundary string (LANGFUSE-1MY, deliberately not dropped)", () => {
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            "A client-side exception has occurred while loading cloud.langfuse.com, see the browser console for more information.",
          ),
        ),
      ).toBe(false);
    });

    it("keeps an OAuthCallback sign-in error (deliberately not dropped)", () => {
      expect(
        isDenylistedNoiseEvent(exceptionEvent("OAuthCallback error", "Error")),
      ).toBe(false);
    });

    it("keeps a different next-auth error (only CLIENT_FETCH_ERROR is dropped)", () => {
      expect(
        isDenylistedNoiseEvent(
          messageEvent("[next-auth][error][SIGNIN_OAUTH_ERROR] boom"),
        ),
      ).toBe(false);
    });

    it("keeps a phrase-quoting app error delivered as a MESSAGE event", () => {
      // Same safety contract on the message-event path: whole-message equality
      // means a longer app message is not caught even without an exception.
      expect(
        isDenylistedNoiseEvent(messageEvent("Failed to fetch created model")),
      ).toBe(false);
    });

    it("keeps the generic prod error-boundary string as a MESSAGE event (still excluded)", () => {
      // captureConsoleIntegration delivers this 1MY string as a message event;
      // it must survive on that path too, not just the exception path.
      expect(
        isDenylistedNoiseEvent(
          messageEvent(
            "A client-side exception has occurred while loading cloud.langfuse.com, see the browser console for more information.",
          ),
        ),
      ).toBe(false);
    });

    it("keeps auth/permission and query-timeout errors (routed to UX, not dropped)", () => {
      expect(isDenylistedNoiseEvent(exceptionEvent("UNAUTHORIZED"))).toBe(
        false,
      );
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent("Query could not be completed within the time limit"),
        ),
      ).toBe(false);
    });

    it("keeps an event with no exception values", () => {
      expect(
        isDenylistedNoiseEvent({ message: "some message" } as ErrorEvent),
      ).toBe(false);
    });

    it("keeps an event with an empty exception value", () => {
      expect(isDenylistedNoiseEvent(exceptionEvent(""))).toBe(false);
    });
  });
});

describe("isReactDevtoolsInternalEvent", () => {
  describe("drops React DevTools internal probes", () => {
    it("drops a message-event probe", () => {
      expect(
        isReactDevtoolsInternalEvent(
          messageEvent(
            "Cannot read properties of undefined (reading '__reactContextDevtoolDebugId')",
          ),
        ),
      ).toBe(true);
    });

    it("drops an exception-value variant", () => {
      expect(
        isReactDevtoolsInternalEvent(
          exceptionEvent(
            "Cannot read properties of undefined (reading '__reactContextDevtoolDebugId')",
            "TypeError",
          ),
        ),
      ).toBe(true);
    });

    it("drops it when the text lives on event.logentry.message", () => {
      expect(
        isReactDevtoolsInternalEvent(
          logentryEvent(
            "Cannot read properties of null (reading '__reactContextDevtoolDebugId')",
          ),
        ),
      ).toBe(true);
    });
  });

  // The safety contract: a suppression predicate must not swallow real errors.
  describe("KEEPS real errors (never masks a genuine app error)", () => {
    it("keeps a real thrown TypeError unrelated to DevTools", () => {
      expect(
        isReactDevtoolsInternalEvent(
          exceptionEvent("TypeError: cannot read x", "TypeError"),
        ),
      ).toBe(false);
    });

    it("keeps an unrelated message event", () => {
      expect(
        isReactDevtoolsInternalEvent(messageEvent("some unrelated message")),
      ).toBe(false);
    });

    it("keeps an event with no exception/message/logentry text", () => {
      expect(isReactDevtoolsInternalEvent({} as ErrorEvent)).toBe(false);
    });
  });
});
