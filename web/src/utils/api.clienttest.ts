import { TRPCClientError } from "@trpc/client";
import { vi } from "vitest";
import {
  EXPECTED_TRPC_ERROR_CODES,
  fetchWithParseErrorStatus,
  getTrpcErrorCode,
  getTrpcErrorPath,
  isExpectedTrpcClientError,
  isNetworkConnectivityError,
  isTrpcResponseParseError,
} from "@/src/utils/api";

/** A JSON.parse SyntaxError annotated with the HTTP status it was parsed
 * from, as produced by `fetchWithParseErrorStatus`. */
const parseErrorWithStatus = (message: string, status: number) => {
  const cause: SyntaxError & { responseStatus?: number } = new SyntaxError(
    message,
  );
  cause.responseStatus = status;
  return cause;
};

/** Builds a TRPCClientError with the given server error shape (code/path). */
const trpcServerError = (opts: {
  code: string;
  httpStatus: number;
  path?: string;
  message?: string;
}) =>
  TRPCClientError.from({
    error: {
      code: -32600,
      message: opts.message ?? opts.code,
      data: {
        code: opts.code,
        httpStatus: opts.httpStatus,
        ...(opts.path !== undefined ? { path: opts.path } : {}),
      },
    },
  });

describe("isNetworkConnectivityError", () => {
  it("detects the reported failed fetch error without a response", () => {
    const error = TRPCClientError.from(new TypeError("Failed to fetch"));

    expect(isNetworkConnectivityError(error)).toBe(true);
  });

  it("detects the reported failed fetch error with a hostname suffix", () => {
    const error = TRPCClientError.from(
      new TypeError("Failed to fetch (cloud.langfuse.com)"),
    );

    expect(isNetworkConnectivityError(error)).toBe(true);
  });

  it("does not treat other network failures as connectivity errors", () => {
    const error = TRPCClientError.from(new TypeError("Load failed"));

    expect(isNetworkConnectivityError(error)).toBe(false);
  });

  it("does not treat tRPC server errors as connectivity errors", () => {
    const error = TRPCClientError.from({
      error: {
        code: -32603,
        message: "Internal server error",
        data: {
          code: "INTERNAL_SERVER_ERROR",
          httpStatus: 500,
          path: "events.all",
        },
      },
    });

    expect(isNetworkConnectivityError(error)).toBe(false);
  });

  it("does not treat response parsing errors as connectivity errors", () => {
    const error = TRPCClientError.from(new SyntaxError("Unexpected token <"), {
      meta: {
        response: new Response("<html></html>", { status: 502 }),
      },
    });

    expect(isNetworkConnectivityError(error)).toBe(false);
  });

  it("does not treat non-tRPC errors as connectivity errors", () => {
    expect(isNetworkConnectivityError(new TypeError("Failed to fetch"))).toBe(
      false,
    );
  });
});

describe("isTrpcResponseParseError", () => {
  it("detects a JSON.parse failure on the response body (Firefox message)", () => {
    const error = TRPCClientError.from(
      new SyntaxError(
        "JSON.parse: unexpected character at line 1 column 1 of the JSON data",
      ),
      {
        meta: { response: new Response("<html></html>", { status: 200 }) },
      },
    );

    expect(isTrpcResponseParseError(error)).toBe(true);
  });

  it("detects a truncated response body (Chromium message)", () => {
    const error = TRPCClientError.from(
      new SyntaxError("Unexpected end of JSON input"),
    );

    expect(isTrpcResponseParseError(error)).toBe(true);
  });

  // Negative fixtures: real errors MUST still flow to Sentry. If any of these
  // start returning true, the suppression rule has grown a hole that hides a
  // genuine bug.
  it("does not match tRPC server errors (a parsed error envelope)", () => {
    const error = trpcServerError({
      code: "INTERNAL_SERVER_ERROR",
      httpStatus: 500,
      path: "events.all",
    });

    expect(isTrpcResponseParseError(error)).toBe(false);
  });

  it("does not match network connectivity failures", () => {
    const error = TRPCClientError.from(new TypeError("Failed to fetch"));

    expect(isTrpcResponseParseError(error)).toBe(false);
  });

  it("does not match a TRPCClientError with a non-SyntaxError cause", () => {
    const error = TRPCClientError.from(new Error("boom"));

    expect(isTrpcResponseParseError(error)).toBe(false);
  });

  it("does not match a raw JSON.parse SyntaxError thrown by app code", () => {
    // Not wrapped by the tRPC client — in handleTrpcError it takes the
    // non-TRPC branch and is captured unchanged.
    expect(
      isTrpcResponseParseError(new SyntaxError("Unexpected end of JSON input")),
    ).toBe(false);
    expect(isTrpcResponseParseError(null)).toBe(false);
    expect(isTrpcResponseParseError(undefined)).toBe(false);
  });

  // Request-too-large (414/431) parse failures are the app-owned
  // oversized-GET-URL bug class (see sendAsPostOption) and MUST keep
  // flowing to Sentry.
  it.each([414, 431])(
    "does not match a parse failure annotated with HTTP %i",
    (status) => {
      const error = TRPCClientError.from(
        parseErrorWithStatus("Unexpected end of JSON input", status),
      );

      expect(isTrpcResponseParseError(error)).toBe(false);
    },
  );

  it("does not match a parse failure whose link meta shows HTTP 431", () => {
    const error = TRPCClientError.from(
      new SyntaxError("Unexpected end of JSON input"),
      { meta: { response: new Response("", { status: 431 }) } },
    );

    expect(isTrpcResponseParseError(error)).toBe(false);
  });

  it("matches a parse failure annotated with a non-request-too-large status", () => {
    const error = TRPCClientError.from(
      parseErrorWithStatus(
        "JSON.parse: unexpected character at line 1 column 1 of the JSON data",
        200,
      ),
    );

    expect(isTrpcResponseParseError(error)).toBe(true);
  });
});

describe("fetchWithParseErrorStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("annotates the parse SyntaxError with the response HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 431 })),
    );

    const response = await fetchWithParseErrorStatus("http://localhost/x");
    await expect(response.json()).rejects.toMatchObject({
      name: "SyntaxError",
      responseStatus: 431,
    });
  });

  it("returns parsed JSON unchanged when the body is valid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
    );

    const response = await fetchWithParseErrorStatus("http://localhost/x");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});

describe("getTrpcErrorCode / getTrpcErrorPath", () => {
  it("extracts the code and path from a tRPC server error", () => {
    const error = trpcServerError({
      code: "NOT_FOUND",
      httpStatus: 404,
      path: "traces.byId",
    });

    expect(getTrpcErrorCode(error)).toBe("NOT_FOUND");
    expect(getTrpcErrorPath(error)).toBe("traces.byId");
  });

  it("returns undefined for non-tRPC errors", () => {
    expect(getTrpcErrorCode(new Error("boom"))).toBeUndefined();
    expect(getTrpcErrorPath(new Error("boom"))).toBeUndefined();
    expect(getTrpcErrorCode("nope")).toBeUndefined();
    expect(getTrpcErrorPath(null)).toBeUndefined();
  });

  it("returns undefined path when the server shape omits it", () => {
    const error = trpcServerError({ code: "FORBIDDEN", httpStatus: 403 });

    expect(getTrpcErrorCode(error)).toBe("FORBIDDEN");
    expect(getTrpcErrorPath(error)).toBeUndefined();
  });
});

describe("isExpectedTrpcClientError", () => {
  // Expected, user-facing states — must be suppressed (not captured to Sentry).
  it.each(EXPECTED_TRPC_ERROR_CODES)(
    "treats %s as an expected client error",
    (code) => {
      const httpStatus =
        code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : 401;
      const error = trpcServerError({ code, httpStatus, path: "traces.byId" });

      expect(isExpectedTrpcClientError(error)).toBe(true);
    },
  );

  // Negative fixtures: real errors MUST still flow to Sentry. If any of these
  // start returning true, the suppression rule has grown a hole that hides a
  // genuine bug.
  it("does not suppress server (5xx) errors", () => {
    const error = trpcServerError({
      code: "INTERNAL_SERVER_ERROR",
      httpStatus: 500,
      path: "events.all",
    });

    expect(isExpectedTrpcClientError(error)).toBe(false);
  });

  it("does not suppress client validation errors (BAD_REQUEST / CONFLICT)", () => {
    expect(
      isExpectedTrpcClientError(
        trpcServerError({ code: "BAD_REQUEST", httpStatus: 400 }),
      ),
    ).toBe(false);
    expect(
      isExpectedTrpcClientError(
        trpcServerError({ code: "CONFLICT", httpStatus: 409 }),
      ),
    ).toBe(false);
  });

  it("does not suppress an unrecognized tRPC code", () => {
    const error = trpcServerError({
      code: "TEAPOT",
      httpStatus: 418,
    });

    expect(isExpectedTrpcClientError(error)).toBe(false);
  });

  it("does not suppress non-tRPC errors or non-errors", () => {
    expect(isExpectedTrpcClientError(new Error("boom"))).toBe(false);
    expect(isExpectedTrpcClientError(new TypeError("Failed to fetch"))).toBe(
      false,
    );
    expect(isExpectedTrpcClientError({ data: { code: "NOT_FOUND" } })).toBe(
      false,
    );
    expect(isExpectedTrpcClientError(null)).toBe(false);
    expect(isExpectedTrpcClientError(undefined)).toBe(false);
  });
});
