import { TRPCClientError } from "@trpc/client";
import {
  EXPECTED_TRPC_ERROR_CODES,
  getTrpcErrorCode,
  getTrpcErrorPath,
  isExpectedTrpcClientError,
  isNetworkConnectivityError,
} from "@/src/utils/api";

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
