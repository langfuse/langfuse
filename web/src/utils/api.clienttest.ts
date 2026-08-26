// @vitest-environment node

import { TRPCClientError } from "@trpc/client";
import { vi } from "vitest";
import {
  EXPECTED_TRPC_CONFLICT_PATHS,
  EXPECTED_TRPC_ERROR_CODES,
  captureBuildId,
  fetchWithParseErrorStatus,
  getApproxTrpcGetUrlBytes,
  getTrpcErrorCode,
  getTrpcErrorFingerprint,
  getTrpcErrorPath,
  isExpectedTrpcClientError,
  isNetworkConnectivityError,
  isTrpcResponseParseError,
  isTrpcZodValidationError,
  MAX_TRPC_GET_URL_BYTES,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
  shouldSendQueryAsPost,
} from "@/src/utils/api";

const {
  captureExceptionMock,
  addBreadcrumbMock,
  trpcErrorToastMock,
  showVersionUpdateToastMock,
} = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  addBreadcrumbMock: vi.fn(),
  trpcErrorToastMock: vi.fn(),
  showVersionUpdateToastMock: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
  addBreadcrumb: addBreadcrumbMock,
}));

vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: trpcErrorToastMock,
}));

// Tripwire for the deleted `showVersionUpdateToast` path: 400/404 plus a
// mismatched `x-build-id` must not be remapped to a refresh toast.
vi.mock("@/src/features/notifications/showVersionUpdateToast", () => ({
  showVersionUpdateToast: showVersionUpdateToastMock,
}));

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
  zodError?: unknown;
}) =>
  TRPCClientError.from({
    error: {
      code: -32600,
      message: opts.message ?? opts.code,
      data: {
        code: opts.code,
        httpStatus: opts.httpStatus,
        ...(opts.path !== undefined ? { path: opts.path } : {}),
        ...(opts.zodError !== undefined ? { zodError: opts.zodError } : {}),
      },
    },
  });

/** Zod 4 stringifies input failures as a JSON issue list — the toast users see today. */
const ZOD4_TOO_SMALL_MESSAGE = JSON.stringify([
  {
    origin: "string",
    code: "too_small",
    minimum: 1,
    inclusive: true,
    path: ["name"],
    message: "Too small: expected string to have >=1 characters",
  },
]);

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

describe("shouldSendQueryAsPost", () => {
  const queryOp = (
    input: unknown,
    context: Record<string, unknown> = {},
    path = "traces.all",
  ) => ({
    type: "query" as const,
    path,
    input,
    context,
  });

  it("keeps small queries on GET", () => {
    expect(
      shouldSendQueryAsPost(
        queryOp({ projectId: "proj_1", filter: [], page: 0, limit: 50 }),
      ),
    ).toBe(false);
  });

  it("honors the explicit sendAsPost context flag", () => {
    expect(
      shouldSendQueryAsPost(
        queryOp({ projectId: "proj_1" }, { sendAsPost: true }),
      ),
    ).toBe(true);
  });

  it("routes a traces.all query whose filter would blow the GET URL as POST", () => {
    // Session-storage-only filter states can exceed the page-URL budget
    // (MAX_URL_FILTER_QUERY_LENGTH) and still be sent as tRPC input. ~200
    // user IDs is the shape that 431s the GET request line.
    const input = {
      projectId: "proj_1",
      filter: [
        {
          column: "userId",
          type: "stringOptions",
          operator: "none of",
          value: Array.from(
            { length: 200 },
            (_, i) => `user-${i}-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`,
          ),
        },
      ],
      page: 0,
      limit: 50,
    };

    expect(getApproxTrpcGetUrlBytes("traces.all", input)).toBeGreaterThan(
      MAX_TRPC_GET_URL_BYTES,
    );
    // Auto-routing does not set `sendAsPost` on the op; the 414/431 diagnostic
    // must use `shouldSendQueryAsPost`, not the explicit flag alone.
    const op = queryOp(input);
    expect(op.context.sendAsPost).not.toBe(true);
    expect(shouldSendQueryAsPost(op)).toBe(true);
  });

  it("routes a traces.metrics query whose id list would blow the GET URL as POST", () => {
    const input = {
      projectId: "proj_1",
      filter: [],
      traceIds: Array.from(
        { length: 100 },
        (_, i) => `trace-${i.toString().padStart(3, "0")}-${"x".repeat(36)}`,
      ),
    };

    expect(getApproxTrpcGetUrlBytes("traces.metrics", input)).toBeGreaterThan(
      MAX_TRPC_GET_URL_BYTES,
    );
    expect(shouldSendQueryAsPost(queryOp(input, {}, "traces.metrics"))).toBe(
      true,
    );
  });

  it("does not force mutations onto the methodOverride POST link", () => {
    expect(
      shouldSendQueryAsPost({
        type: "mutation",
        path: "traces.deleteMany",
        input: {
          projectId: "proj_1",
          traceIds: Array.from({ length: 200 }, (_, i) => `t-${i}`),
        },
        context: {},
      }),
    ).toBe(false);
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
  const httpStatusByCode: Record<string, number> = {
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    UNAUTHORIZED: 401,
    UNPROCESSABLE_CONTENT: 422,
  };

  // Expected, user-facing states — must be suppressed (not captured to Sentry).
  it.each(EXPECTED_TRPC_ERROR_CODES)(
    "treats %s as an expected client error",
    (code) => {
      const error = trpcServerError({
        code,
        httpStatus: httpStatusByCode[code],
        path: "traces.byId",
      });

      expect(isExpectedTrpcClientError(error)).toBe(true);
    },
  );

  it("treats the ClickHouse query-guardrail advice as expected", () => {
    // Mirrors the production shape: `withErrorHandling` (web/src/server/api/
    // trpc.ts) maps ClickHouseResourceError to UNPROCESSABLE_CONTENT with the
    // RESOURCE_LIMIT_ERROR_MESSAGE advice; the UI renders it as toast/inline.
    const error = TRPCClientError.from({
      error: {
        code: -32600,
        message:
          "Your query could not be completed. Please narrow your request by adding more specific filters (e.g., a shorter date range).",
        data: {
          code: "UNPROCESSABLE_CONTENT",
          httpStatus: 422,
          path: "traces.metrics",
          errorName: "ClickHouseResourceError",
        },
      },
    });

    expect(isExpectedTrpcClientError(error)).toBe(true);
  });

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

  it("treats a stale in-app-agent tool approval as expected", () => {
    // decideToolApproval throws CONFLICT only when the parent run is no
    // longer AWAITING_APPROVAL (already decided, expired, or cancelled).
    // The UI toasts "Reload the conversation." — product working as designed.
    const error = trpcServerError({
      code: "CONFLICT",
      httpStatus: 409,
      path: "inAppAgent.decideToolApproval",
      message: "This approval is no longer pending. Reload the conversation.",
    });

    expect(isExpectedTrpcClientError(error)).toBe(true);
  });

  it("does not treat CONFLICT on other procedures as expected", () => {
    // Negative fixture: duplicate-name / unique-constraint CONFLICTs must
    // still reach Sentry. Widening the allowlist would hide those.
    expect(
      isExpectedTrpcClientError(
        trpcServerError({
          code: "CONFLICT",
          httpStatus: 409,
          path: "prompts.create",
        }),
      ),
    ).toBe(false);
    expect(
      isExpectedTrpcClientError(
        trpcServerError({
          code: "CONFLICT",
          httpStatus: 409,
          path: "inAppAgent.startRun",
        }),
      ),
    ).toBe(false);
  });

  it("suppresses Zod input validation (empty/too-short fields) as expected user input", () => {
    expect(
      isExpectedTrpcClientError(
        trpcServerError({
          code: "BAD_REQUEST",
          httpStatus: 400,
          path: "prompts.create",
          message: ZOD4_TOO_SMALL_MESSAGE,
        }),
      ),
    ).toBe(true);
    expect(
      isExpectedTrpcClientError(
        trpcServerError({
          code: "BAD_REQUEST",
          httpStatus: 400,
          path: "traces.byId",
          message: `Invalid input, ${ZOD4_TOO_SMALL_MESSAGE}`,
        }),
      ),
    ).toBe(true);
    expect(
      isExpectedTrpcClientError(
        trpcServerError({
          code: "BAD_REQUEST",
          httpStatus: 400,
          path: "prompts.create",
          message: "Invalid input",
          zodError: {
            formErrors: [],
            fieldErrors: {
              name: ["Too small: expected string to have >=1 characters"],
            },
          },
        }),
      ),
    ).toBe(true);
  });

  it("does not treat a non-Zod BAD_REQUEST as validation", () => {
    expect(
      isTrpcZodValidationError(
        trpcServerError({
          code: "BAD_REQUEST",
          httpStatus: 400,
          message: "Invalid input, projectId is required",
        }),
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

describe("getTrpcErrorFingerprint", () => {
  // The whole point of the fingerprint: unrelated tRPC failures must STOP
  // grouping into one issue, while retries of the same failure class must
  // keep grouping together.
  it("groups the same code + path together even when messages differ", () => {
    const first = trpcServerError({
      code: "FORBIDDEN",
      httpStatus: 403,
      path: "organizations.delete",
      message: "Deletion of your projects is still being processed",
    });
    const second = trpcServerError({
      code: "FORBIDDEN",
      httpStatus: 403,
      path: "organizations.delete",
      message: "some other server-minted advice",
    });

    expect(getTrpcErrorFingerprint(first)).toEqual(
      getTrpcErrorFingerprint(second),
    );
  });

  it("splits different codes on the same path", () => {
    const forbidden = trpcServerError({
      code: "FORBIDDEN",
      httpStatus: 403,
      path: "traces.deleteMany",
    });
    const internal = trpcServerError({
      code: "INTERNAL_SERVER_ERROR",
      httpStatus: 500,
      path: "traces.deleteMany",
    });

    expect(getTrpcErrorFingerprint(forbidden)).not.toEqual(
      getTrpcErrorFingerprint(internal),
    );
  });

  it("splits the same code on different paths", () => {
    const evals = trpcServerError({
      code: "BAD_REQUEST",
      httpStatus: 400,
      path: "evals.createJob",
    });
    const traces = trpcServerError({
      code: "BAD_REQUEST",
      httpStatus: 400,
      path: "traces.deleteMany",
    });

    expect(getTrpcErrorFingerprint(evals)).not.toEqual(
      getTrpcErrorFingerprint(traces),
    );
  });

  it("uses a stable placeholder when the server shape omits the path", () => {
    const error = trpcServerError({ code: "FORBIDDEN", httpStatus: 403 });

    expect(getTrpcErrorFingerprint(error)).toEqual([
      "trpc-client-error",
      "FORBIDDEN",
      "unknown",
    ]);
  });

  it("never leaks the error message into the fingerprint (bounded cardinality)", () => {
    const message = "user-specific advice with dynamic content 12345";
    const error = trpcServerError({
      code: "UNPROCESSABLE_CONTENT",
      httpStatus: 422,
      path: "traces.metrics",
      message,
    });

    const fingerprint = getTrpcErrorFingerprint(error);
    expect(fingerprint).toEqual([
      "trpc-client-error",
      "UNPROCESSABLE_CONTENT",
      "traces.metrics",
    ]);
    expect(fingerprint.join()).not.toContain("12345");
  });
});

describe("reportTrpcErrorWithoutToast", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureExceptionMock.mockClear();
    addBreadcrumbMock.mockClear();
    trpcErrorToastMock.mockClear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("suppresses a stale in-app-agent tool approval (breadcrumb, no capture)", () => {
    reportTrpcErrorWithoutToast(
      trpcServerError({
        code: "CONFLICT",
        httpStatus: 409,
        path: EXPECTED_TRPC_CONFLICT_PATHS[0],
        message: "This approval is no longer pending. Reload the conversation.",
      }),
      "in-app-agent",
    );

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
    expect(addBreadcrumbMock.mock.calls[0]![0].data).toMatchObject({
      code: "CONFLICT",
      path: "inAppAgent.decideToolApproval",
    });
  });

  it("suppresses expected codes (breadcrumb, no capture) — same policy as the seam", () => {
    // The organizations.delete FORBIDDEN advice: previously console.error'd by
    // the component (one Sentry event per retry), now classified as expected.
    const error = trpcServerError({
      code: "FORBIDDEN",
      httpStatus: 403,
      path: "organizations.delete",
      message:
        "Deletion of your projects is still being processed, please try deleting the organization later",
    });

    reportTrpcErrorWithoutToast(error, "organizations");

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
    expect(addBreadcrumbMock.mock.calls[0]![0].data).toMatchObject({
      code: "FORBIDDEN",
      path: "organizations.delete",
    });
  });

  it("does not capture Zod input validation (empty/too-short fields)", () => {
    reportTrpcErrorWithoutToast(
      trpcServerError({
        code: "BAD_REQUEST",
        httpStatus: 400,
        path: "prompts.create",
        message: ZOD4_TOO_SMALL_MESSAGE,
      }),
      "prompts",
    );

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
  });

  // Negative fixture: real errors MUST still be captured, with the
  // procedure/code fingerprint and tags.
  it("captures CONFLICT on procedures outside the allowlist", () => {
    reportTrpcErrorWithoutToast(
      trpcServerError({
        code: "CONFLICT",
        httpStatus: 409,
        path: "prompts.create",
      }),
      "prompts",
    );

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [, options] = captureExceptionMock.mock.calls[0]!;
    expect(options.tags).toMatchObject({
      area: "trpc",
      "trpc.code": "CONFLICT",
      "trpc.path": "prompts.create",
    });
  });

  it("captures a real (5xx) tRPC error with fingerprint and tags", () => {
    const error = trpcServerError({
      code: "INTERNAL_SERVER_ERROR",
      httpStatus: 500,
      path: "projects.create",
    });

    reportTrpcErrorWithoutToast(error, "projects");

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [, options] = captureExceptionMock.mock.calls[0]!;
    expect(options.fingerprint).toEqual([
      "trpc-client-error",
      "INTERNAL_SERVER_ERROR",
      "projects.create",
    ]);
    // tRPC failures keep the seam's own area regardless of the caller's.
    expect(options.tags).toMatchObject({
      area: "trpc",
      "trpc.code": "INTERNAL_SERVER_ERROR",
      "trpc.path": "projects.create",
    });
  });

  it("captures non-tRPC errors with the caller's area (not the seam's `trpc`)", () => {
    reportTrpcErrorWithoutToast(new Error("post-success work failed"), "evals");

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [, options] = captureExceptionMock.mock.calls[0]!;
    expect(options.tags.area).toBe("evals");
  });

  it("never shows the standard error toast (the local onError owns the UX)", () => {
    reportTrpcErrorWithoutToast(
      trpcServerError({
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
        path: "projects.create",
      }),
      "projects",
    );
    reportTrpcErrorWithoutToast(new Error("boom"), "projects");

    expect(trpcErrorToastMock).not.toHaveBeenCalled();
  });
});

describe("reportNonTrpcError", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureExceptionMock.mockClear();
    addBreadcrumbMock.mockClear();
    trpcErrorToastMock.mockClear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("swallows TRPCClientErrors (already classified by the react-query default onError)", () => {
    reportNonTrpcError(
      trpcServerError({
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
        path: "projects.create",
      }),
      "projects",
    );

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(trpcErrorToastMock).not.toHaveBeenCalled();
  });

  // Negative fixture: a genuine non-tRPC failure (post-success callback,
  // router.push, ...) MUST still be captured.
  it("reports non-tRPC errors with the caller's area", () => {
    reportNonTrpcError(new Error("router.push failed"), "organizations", {
      context: "delete-organization",
    });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [, options] = captureExceptionMock.mock.calls[0]!;
    expect(options.tags.area).toBe("organizations");
    expect(options.extra).toEqual({ context: "delete-organization" });
  });
});

describe("400/404 tRPC errors must not be remapped to a version-update toast", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureExceptionMock.mockClear();
    addBreadcrumbMock.mockClear();
    trpcErrorToastMock.mockClear();
    showVersionUpdateToastMock.mockClear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "running-build");
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("classifies a 400 even when x-build-id differs from the running build", () => {
    // Evaluators (and any other page) can legitimately 400 while HTML and API
    // are served by different builds. The version-update banner is the only
    // mismatch UX; this seam must still classify the error.
    captureBuildId(
      new Response("", { headers: { "x-build-id": "other-build" } }),
    );

    reportTrpcErrorWithoutToast(
      trpcServerError({
        code: "BAD_REQUEST",
        httpStatus: 400,
        path: "evals.allConfigs",
      }),
      "evals",
    );

    expect(showVersionUpdateToastMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("classifies a 404 NOT_FOUND as expected even when build ids differ", () => {
    captureBuildId(
      new Response("", { headers: { "x-build-id": "other-build" } }),
    );

    reportTrpcErrorWithoutToast(
      trpcServerError({
        code: "NOT_FOUND",
        httpStatus: 404,
        path: "evals.byId",
      }),
      "evals",
    );

    expect(showVersionUpdateToastMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
  });
});
