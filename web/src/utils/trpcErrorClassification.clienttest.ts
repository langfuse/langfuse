// @vitest-environment node

import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import {
  classifyTrpcToastError,
  EXPECTED_TRPC_BAD_REQUEST_PATHS,
} from "@/src/utils/trpcErrorClassification";

const trpcError = (code: string, httpStatus: number, path = "test.procedure") =>
  TRPCClientError.from({
    error: {
      code: -32600,
      message: "Expected failure",
      data: { code, httpStatus, path },
    },
  });

describe("classifyTrpcToastError", () => {
  it.each([
    ["BAD_REQUEST", 400, "frontend", "internal"],
    ["FORBIDDEN", 403, "backend", "permission"],
    ["NOT_FOUND", 404, "backend", "product_state"],
    ["TOO_MANY_REQUESTS", 429, "backend", "rate_limit"],
    ["UNPROCESSABLE_CONTENT", 422, "backend", "resource_limit"],
    ["SERVICE_UNAVAILABLE", 503, "network", "transient"],
    ["INTERNAL_SERVER_ERROR", 500, "backend", "internal"],
    ["PARSE_ERROR", 418, "backend", "unknown"],
  ] as const)(
    "maps %s (%i) to %s/%s",
    (code, httpStatus, errorOrigin, errorCategory) => {
      expect(classifyTrpcToastError(trpcError(code, httpStatus))).toEqual({
        errorOrigin,
        errorCategory,
        trpcCode: code,
        httpStatus,
      });
    },
  );

  it.each(EXPECTED_TRPC_BAD_REQUEST_PATHS)(
    "classifies user-configured BAD_REQUEST path %s as user input",
    (path) => {
      expect(
        classifyTrpcToastError(trpcError("BAD_REQUEST", 400, path)),
      ).toEqual({
        errorOrigin: "backend",
        errorCategory: "user_input",
        trpcCode: "BAD_REQUEST",
        httpStatus: 400,
      });
    },
  );

  it("classifies non-JSON transport responses without capturing their content", () => {
    const error = new TRPCClientError("Unexpected token", {
      cause: new SyntaxError("Sensitive response body"),
    });

    expect(classifyTrpcToastError(error)).toEqual({
      errorOrigin: "network",
      errorCategory: "transient",
    });
  });

  it("classifies an explicit failed fetch as a network failure", () => {
    const error = new TRPCClientError("Failed to fetch", {
      cause: new TypeError("Failed to fetch"),
    });

    expect(classifyTrpcToastError(error)).toEqual({
      errorOrigin: "network",
      errorCategory: "transient",
    });
  });

  it("keeps an unrecognized pathless tRPC client failure in the frontend bucket", () => {
    const error = new TRPCClientError("Transformer failed", {
      cause: new Error("Transformer failed"),
    });

    expect(classifyTrpcToastError(error)).toEqual({
      errorOrigin: "frontend",
      errorCategory: "internal",
    });
  });

  it("keeps oversized request parse failures in the frontend bucket", () => {
    const cause = new SyntaxError(
      "Unexpected end of JSON input",
    ) as SyntaxError & {
      responseStatus?: number;
    };
    cause.responseStatus = 431;

    expect(
      classifyTrpcToastError(new TRPCClientError("parse failed", { cause })),
    ).toEqual({
      errorOrigin: "frontend",
      errorCategory: "internal",
      httpStatus: 431,
    });
  });

  it("classifies values outside the tRPC seam as frontend failures", () => {
    expect(classifyTrpcToastError(new Error("boom"))).toEqual({
      errorOrigin: "frontend",
      errorCategory: "internal",
    });
  });
});
