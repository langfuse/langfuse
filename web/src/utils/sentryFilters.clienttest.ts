import { type ErrorEvent } from "@sentry/nextjs";

import {
  isDenylistedNoiseEvent,
  isNoisyHttpClientPollEvent,
  isPosthogRecorderInternalEvent,
  isReactDevtoolsInternalEvent,
  isStaleChunkParseErrorEvent,
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

  describe("D. drops known-benign non-Error promise rejections (exact value denylist)", () => {
    // Real shape (LANGFUSE-5T9/5TA): SDK-synthesized `UnhandledRejection` type,
    // `onunhandledrejection` mechanism, NO stack — grouping falls back to the
    // stringified value, so every new value minted a new fingerprint.
    const nonErrorRejectionEvent = (rejectionValue: string): ErrorEvent =>
      ({
        exception: {
          values: [
            {
              type: "UnhandledRejection",
              value: `Non-Error promise rejection captured with value: ${rejectionValue}`,
              mechanism: {
                type: "auto.browser.global_handlers.onunhandledrejection",
                handled: false,
              },
            },
          ],
        },
      }) as ErrorEvent;

    it("drops the wallet/extension shim rejection (LANGFUSE-5T9)", () => {
      expect(
        isDenylistedNoiseEvent(
          nonErrorRejectionEvent("Not implemented on this platform"),
        ),
      ).toBe(true);
    });

    it("drops the empty `Promise.reject(undefined)` rejection (LANGFUSE-5TA)", () => {
      expect(isDenylistedNoiseEvent(nonErrorRejectionEvent("undefined"))).toBe(
        true,
      );
    });

    it("drops the Outlook SafeLinks scanner artifact (LANGFUSE-11Z, variable tail)", () => {
      expect(
        isDenylistedNoiseEvent(
          nonErrorRejectionEvent(
            "Object Not Found Matching Id:2, MethodName:update, ParamCount:4",
          ),
        ),
      ).toBe(true);
    });
  });

  describe("E. drops environmental storage-access SecurityError (console-captured only)", () => {
    // Real shape (LANGFUSE-5TC/5TD/5TE/5TF): our useLocalStorage catch logs the
    // DOMException via console.error → captureConsoleIntegration re-captures it
    // as an exception event (mechanism `auto.core.capture_console`) carrying
    // the browser-generated message.
    const consoleCapturedStorageDenial = (value: string): ErrorEvent =>
      ({
        exception: {
          values: [
            {
              type: "SecurityError",
              value,
              mechanism: { type: "auto.core.capture_console", handled: true },
            },
          ],
        },
      }) as ErrorEvent;

    it("drops the localStorage access denial (LANGFUSE-5TC/5TD/5TE/5TF)", () => {
      expect(
        isDenylistedNoiseEvent(
          consoleCapturedStorageDenial(
            "Failed to read the 'localStorage' property from 'Window': Access is denied for this document.",
          ),
        ),
      ).toBe(true);
    });

    it("drops the sessionStorage variant of the same browser artifact", () => {
      expect(
        isDenylistedNoiseEvent(
          consoleCapturedStorageDenial(
            "Failed to read the 'sessionStorage' property from 'Window': Access is denied for this document.",
          ),
        ),
      ).toBe(true);
    });

    it("KEEPS an UNCAUGHT storage SecurityError (page crash via global onerror)", () => {
      // A bare storage read during render that crashes the page arrives via the
      // global handler, not capture_console — that is a real diagnostic and
      // must survive.
      const event = {
        exception: {
          values: [
            {
              type: "SecurityError",
              value:
                "Failed to read the 'localStorage' property from 'Window': Access is denied for this document.",
              mechanism: {
                type: "auto.browser.global_handlers.onerror",
                handled: false,
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isDenylistedNoiseEvent(event)).toBe(false);
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

    it("keeps a non-Error rejection with an UNKNOWN value (could be app code)", () => {
      const event = {
        exception: {
          values: [
            {
              type: "UnhandledRejection",
              value:
                "Non-Error promise rejection captured with value: Something went wrong loading traces",
              mechanism: {
                type: "auto.browser.global_handlers.onunhandledrejection",
                handled: false,
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isDenylistedNoiseEvent(event)).toBe(false);
    });

    it("keeps the object-shaped rejection variant (has carried real failures)", () => {
      // LANGFUSE-1BB: `code, message, stack` payloads — a serialized error.
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            "Object captured as promise rejection with keys: code, message, stack",
            "UnhandledRejection",
          ),
        ),
      ).toBe(false);
    });

    it("keeps a real unhandled rejection carrying an Error object", () => {
      // A rejected real Error keeps its own type — never `UnhandledRejection`.
      const event = {
        exception: {
          values: [
            {
              type: "TypeError",
              value: "Cannot read properties of undefined (reading 'map')",
              mechanism: {
                type: "auto.browser.global_handlers.onunhandledrejection",
                handled: false,
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isDenylistedNoiseEvent(event)).toBe(false);
    });

    it("keeps a benign-looking rejection value with extra text (exact match only)", () => {
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            "Non-Error promise rejection captured with value: undefined is not a function",
            "UnhandledRejection",
          ),
        ),
      ).toBe(false);
    });

    it("keeps a real SecurityError from app-adjacent logic (cross-origin frame access)", () => {
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            'Blocked a frame with origin "https://cloud.langfuse.com" from accessing a cross-origin frame.',
            "SecurityError",
          ),
        ),
      ).toBe(false);
    });

    it("keeps the storage-denial message when the type is NOT SecurityError", () => {
      // Proves the type guard: an app error merely quoting the message survives.
      expect(
        isDenylistedNoiseEvent(
          exceptionEvent(
            "Failed to read the 'localStorage' property from 'Window': Access is denied for this document.",
            "Error",
          ),
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

    it("drops a mixed event: EMPTY exception value but text on message", () => {
      // An empty-string exception value is not nullish, so a naive `??` chain
      // would keep it and never look at `message`. `eventText` treats it as
      // absent, so this still matches.
      expect(
        isReactDevtoolsInternalEvent({
          exception: { values: [{ value: "" }] },
          message:
            "Cannot read properties of undefined (reading '__reactContextDevtoolDebugId')",
        } as unknown as Parameters<typeof isReactDevtoolsInternalEvent>[0]),
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

/**
 * Build the exact WIRE shape the SDK hands `beforeSend` for a chunk PARSE
 * failure (LANGFUSE-5WH/5WG/5WD/5S7): global `onerror` mechanism,
 * `SyntaxError`, and a single frame at the chunk URL whose function is the
 * SDK's UNKNOWN_FUNCTION placeholder `"?"` (server-side normalization later
 * strips that — the shape stored events show). Pass `fn: null` to build the
 * normalized shape with the `function` key genuinely absent (an explicit
 * `undefined` would be swallowed by the default parameter).
 */
function chunkParseErrorEvent(
  value: string,
  filename = "app:///_next/static/chunks/0_w4b6l3mpyep.js",
  fn: string | null = "?",
): ErrorEvent {
  return {
    exception: {
      values: [
        {
          type: "SyntaxError",
          value,
          mechanism: {
            type: "auto.browser.global_handlers.onerror",
            handled: false,
          },
          stacktrace: {
            frames: [fn === null ? { filename } : { filename, function: fn }],
          },
        },
      ],
    },
  } as ErrorEvent;
}

describe("isStaleChunkParseErrorEvent", () => {
  describe("matches stale/truncated chunk parse failures (grouped, not dropped)", () => {
    it.each([
      ["Unexpected end of input"], // Chrome, LANGFUSE-5WH
      ['"" literal not terminated before end of script'], // Firefox, LANGFUSE-5WG
      ["missing } after property list"], // Firefox, LANGFUSE-5WD
      ["Invalid or unexpected token"], // Chrome, LANGFUSE-5S7
      ["expected expression, got end of script"], // Firefox, LANGFUSE-5WN
    ])("matches the real parse message %j", (value) => {
      expect(isStaleChunkParseErrorEvent(chunkParseErrorEvent(value))).toBe(
        true,
      );
    });

    it("matches regardless of the (per-deploy hashed) chunk filename", () => {
      expect(
        isStaleChunkParseErrorEvent(
          chunkParseErrorEvent(
            "Unexpected end of input",
            "app:///_next/static/chunks/3g9a8ojcqetek.js",
          ),
        ),
      ).toBe(true);
    });

    it("matches the normalized stored shape too (function key absent instead of '?')", () => {
      const event = chunkParseErrorEvent(
        "Unexpected end of input",
        "app:///_next/static/chunks/3g9a8ojcqetek.js",
        null,
      );
      // Guard the fixture itself: the frame must NOT carry a function key.
      expect(
        event.exception?.values?.[0]?.stacktrace?.frames?.[0],
      ).not.toHaveProperty("function");
      expect(isStaleChunkParseErrorEvent(event)).toBe(true);
    });

    it("is grouped by beforeSend, NOT dropped by the denylist", () => {
      expect(
        isDenylistedNoiseEvent(chunkParseErrorEvent("Unexpected end of input")),
      ).toBe(false);
    });
  });

  describe("NEVER matches a user-authored or app-code SyntaxError", () => {
    it("keeps the evals editor's user-code SyntaxError (LANGFUSE-5W3 shape)", () => {
      // Real shape: console.error capture with app + vendor formatter frames.
      const event = {
        exception: {
          values: [
            {
              type: "SyntaxError",
              value: "Unexpected token (1:38)",
              mechanism: { type: "auto.core.capture_console", handled: true },
              stacktrace: {
                frames: [
                  {
                    filename:
                      "web/src/features/evals/components/code-eval-template-form-body.tsx",
                    function: "P",
                  },
                  {
                    filename:
                      "node_modules/.pnpm/prettier@3.8.3/node_modules/prettier/standalone.mjs",
                    function: "Jn",
                  },
                ],
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isStaleChunkParseErrorEvent(event)).toBe(false);
    });

    it("keeps the evals editor's user-code lint error (LANGFUSE-5W2 shape, type Error)", () => {
      const event = {
        exception: {
          values: [
            {
              type: "Error",
              value:
                "Expected class, function definition or async function definition after decorator at byte range 477..481",
              mechanism: { type: "auto.core.capture_console", handled: true },
              stacktrace: {
                frames: [
                  {
                    filename:
                      "web/src/features/evals/utils/code-eval-template-validation.ts",
                    function: "aa",
                  },
                ],
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isStaleChunkParseErrorEvent(event)).toBe(false);
    });

    it("keeps a runtime SyntaxError thrown by app code (JSON.parse — multi-frame)", () => {
      const event = {
        exception: {
          values: [
            {
              type: "SyntaxError",
              value: "Unexpected end of JSON input",
              mechanism: {
                type: "auto.browser.global_handlers.onerror",
                handled: false,
              },
              stacktrace: {
                frames: [
                  {
                    filename: "app:///_next/static/chunks/0r47ep231kqhy.js",
                    function: "loadSavedFilters",
                  },
                  {
                    filename: "app:///_next/static/chunks/0r47ep231kqhy.js",
                    function: "JSON.parse",
                  },
                ],
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isStaleChunkParseErrorEvent(event)).toBe(false);
    });

    it("keeps a single-frame SyntaxError with a NAMED function (runtime throw)", () => {
      const event = {
        exception: {
          values: [
            {
              type: "SyntaxError",
              value: "Unexpected end of JSON input",
              mechanism: {
                type: "auto.browser.global_handlers.onerror",
                handled: false,
              },
              stacktrace: {
                frames: [
                  {
                    filename: "app:///_next/static/chunks/0r47ep231kqhy.js",
                    function: "parseStoredView",
                  },
                ],
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isStaleChunkParseErrorEvent(event)).toBe(false);
    });

    it("keeps a parse error in a non-chunk script", () => {
      expect(
        isStaleChunkParseErrorEvent(
          chunkParseErrorEvent(
            "Unexpected end of input",
            "app:///some-other-script.js",
          ),
        ),
      ).toBe(false);
    });

    it("keeps a SyntaxError with no stacktrace and a non-SyntaxError parse-like event", () => {
      expect(
        isStaleChunkParseErrorEvent(
          exceptionEvent("Unexpected end of input", "SyntaxError"),
        ),
      ).toBe(false);
      expect(
        isStaleChunkParseErrorEvent(
          chunkParseErrorEvent("Unexpected end of input"),
        ),
      ).toBe(true); // sanity: same builder matches when shape is complete
    });
  });
});

/** Frame helper for recorder-stack fixtures. */
function frame(filename: string, fn?: string) {
  return { filename, function: fn };
}

describe("isPosthogRecorderInternalEvent", () => {
  // Wire shape: the recorder loads with a version query that survives into
  // frame filenames handed to beforeSend (stored events show it on abs_path).
  const RECORDER = "app:///static/posthog-recorder.js?v=1.390.2";

  describe("drops errors thrown wholly inside the PostHog session recorder", () => {
    it("drops the rrweb mutation-processing SyntaxError (LANGFUSE-5VX shape)", () => {
      const event = {
        exception: {
          values: [
            {
              type: "SyntaxError",
              value: "Invalid or unexpected token",
              mechanism: {
                type: "auto.browser.global_handlers.onerror",
                handled: false,
              },
              stacktrace: {
                frames: [
                  frame(RECORDER, "Ut.processMutations"),
                  frame(RECORDER, "Ut.emit"),
                  frame(RECORDER, "Ws.onRRwebEmit"),
                  frame("<anonymous>", "Array.forEach"),
                ],
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isPosthogRecorderInternalEvent(event)).toBe(true);
    });

    it("drops the same shape without the version query (normalized stored filename)", () => {
      const event = {
        exception: {
          values: [
            {
              type: "SyntaxError",
              value: "Invalid or unexpected token",
              stacktrace: {
                frames: [
                  frame(
                    "app:///static/posthog-recorder.js",
                    "Ut.processMutations",
                  ),
                ],
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isPosthogRecorderInternalEvent(event)).toBe(true);
    });

    it("drops the addEventListener-wrapped variant with a source-mapped Sentry SDK frame (LANGFUSE-5VY stored shape)", () => {
      const event = {
        exception: {
          values: [
            {
              type: "SyntaxError",
              value: "Invalid or unexpected token",
              mechanism: {
                type: "auto.browser.browserapierrors.addEventListener",
                handled: false,
              },
              stacktrace: {
                frames: [
                  frame(
                    "node_modules/.pnpm/@sentry+browser@10.64.0/node_modules/@sentry/browser/src/helpers.ts",
                    "r",
                  ),
                  frame(RECORDER, "l"),
                  frame(RECORDER, "Se"),
                  frame(RECORDER, "Ws.Hd"),
                ],
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isPosthogRecorderInternalEvent(event)).toBe(true);
    });
  });

  describe("KEEPS any error that touches app code", () => {
    it("keeps a stack that mixes recorder frames with an app chunk frame", () => {
      const event = {
        exception: {
          values: [
            {
              type: "TypeError",
              value: "Cannot read properties of undefined (reading 'map')",
              stacktrace: {
                frames: [
                  frame(RECORDER, "Ws.onRRwebEmit"),
                  frame(
                    "app:///_next/static/chunks/0r47ep231kqhy.js",
                    "onMutation",
                  ),
                ],
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isPosthogRecorderInternalEvent(event)).toBe(false);
    });

    it("keeps the wrapped-listener variant when the SDK wrapper is bundled into an app chunk (prod wire shape — deliberate coverage gap)", () => {
      // In a prod bundle the Sentry wrap() frame is an app-chunk filename;
      // allowing chunk frames could mask real app listener errors, so this
      // shape stays kept even though it is recorder noise (LANGFUSE-5VY).
      const event = {
        exception: {
          values: [
            {
              type: "SyntaxError",
              value: "Invalid or unexpected token",
              stacktrace: {
                frames: [
                  frame("app:///_next/static/chunks/2-jdgbtsa7jx3.js", "r"),
                  frame(RECORDER, "l"),
                  frame(RECORDER, "Ws.Hd"),
                ],
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isPosthogRecorderInternalEvent(event)).toBe(false);
    });

    it("keeps an app-only stack (no recorder frame at all)", () => {
      const event = {
        exception: {
          values: [
            {
              type: "TypeError",
              value: "boom",
              stacktrace: {
                frames: [
                  frame("app:///_next/static/chunks/0r47ep231kqhy.js", "fn"),
                ],
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isPosthogRecorderInternalEvent(event)).toBe(false);
    });

    it("keeps an all-opaque stack (<anonymous>/[native code] only — no recorder attribution)", () => {
      const event = {
        exception: {
          values: [
            {
              type: "TypeError",
              value: "boom",
              stacktrace: {
                frames: [
                  frame("<anonymous>", "Array.forEach"),
                  frame("[native code]"),
                ],
              },
            },
          ],
        },
      } as ErrorEvent;
      expect(isPosthogRecorderInternalEvent(event)).toBe(false);
    });

    it("keeps events with no stacktrace", () => {
      expect(
        isPosthogRecorderInternalEvent(exceptionEvent("boom", "TypeError")),
      ).toBe(false);
      expect(isPosthogRecorderInternalEvent(messageEvent("boom"))).toBe(false);
    });
  });
});
