// @vitest-environment node

import { TRPCClientError } from "@trpc/client";
import { vi } from "vitest";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { formatTrpcZodValidationDescription } from "@/src/utils/trpcValidationError";

const { showErrorToastMock } = vi.hoisted(() => ({
  showErrorToastMock: vi.fn(),
}));

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: showErrorToastMock,
}));

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

const trpcError = (opts: {
  code: string;
  httpStatus: number;
  message: string;
  path?: string;
  zodError?: unknown;
  traceId?: string;
}) =>
  TRPCClientError.from({
    error: {
      code: -32600,
      message: opts.message,
      data: {
        code: opts.code,
        httpStatus: opts.httpStatus,
        ...(opts.path !== undefined ? { path: opts.path } : {}),
        ...(opts.zodError !== undefined ? { zodError: opts.zodError } : {}),
        ...(opts.traceId !== undefined ? { traceId: opts.traceId } : {}),
      },
    },
  });

describe("formatTrpcZodValidationDescription", () => {
  it("turns a Zod 4 JSON issue list into field: message lines", () => {
    const error = trpcError({
      code: "BAD_REQUEST",
      httpStatus: 400,
      message: ZOD4_TOO_SMALL_MESSAGE,
    });

    expect(formatTrpcZodValidationDescription(error)).toBe(
      "name: Too small: expected string to have >=1 characters",
    );
  });

  it("extracts an issue list prefixed with human text", () => {
    const error = trpcError({
      code: "BAD_REQUEST",
      httpStatus: 400,
      message: `Invalid input, ${ZOD4_TOO_SMALL_MESSAGE}`,
    });

    expect(formatTrpcZodValidationDescription(error)).toBe(
      "name: Too small: expected string to have >=1 characters",
    );
  });

  it("joins multiple issues and uses flattenError when the message is not JSON", () => {
    const error = trpcError({
      code: "BAD_REQUEST",
      httpStatus: 400,
      message: "Invalid input",
      zodError: {
        formErrors: ["Fix the form"],
        fieldErrors: {
          name: ["Too small: expected string to have >=1 characters"],
          slug: ["Required"],
        },
      },
    });

    expect(formatTrpcZodValidationDescription(error)).toBe(
      [
        "name: Too small: expected string to have >=1 characters",
        "slug: Required",
        "Fix the form",
      ].join("\n"),
    );
  });

  it("returns null for a non-Zod BAD_REQUEST", () => {
    const error = trpcError({
      code: "BAD_REQUEST",
      httpStatus: 400,
      message: "Invalid input, projectId is required",
    });

    expect(formatTrpcZodValidationDescription(error)).toBeNull();
  });
});

describe("trpcErrorToast", () => {
  beforeEach(() => {
    showErrorToastMock.mockClear();
  });

  it("classifies a pathless response parse failure as tRPC", () => {
    trpcErrorToast(
      new TRPCClientError("Unexpected token", {
        cause: new SyntaxError("Unexpected token"),
      }),
    );

    expect(showErrorToastMock).toHaveBeenCalledWith(
      "Unexpected Response",
      "The request could not be completed. Please try again or contact support if this persists.",
      "WARNING",
      undefined,
      undefined,
      "trpc",
      {
        errorOrigin: "network",
        errorCategory: "transient",
      },
    );
  });

  it("shows a readable Invalid input toast instead of the Zod JSON dump", () => {
    trpcErrorToast(
      trpcError({
        code: "BAD_REQUEST",
        httpStatus: 400,
        path: "prompts.create",
        message: ZOD4_TOO_SMALL_MESSAGE,
      }),
    );

    expect(showErrorToastMock).toHaveBeenCalledWith(
      "Invalid input",
      "name: Too small: expected string to have >=1 characters",
      "WARNING",
      "prompts.create",
      undefined,
      "trpc",
      {
        errorOrigin: "backend",
        errorCategory: "user_input",
        trpcCode: "BAD_REQUEST",
        httpStatus: 400,
      },
    );
  });

  it("keeps the generic Bad Request title for non-Zod 4xx errors", () => {
    trpcErrorToast(
      trpcError({
        code: "BAD_REQUEST",
        httpStatus: 400,
        path: "prompts.create",
        message: "Invalid input, projectId is required",
      }),
    );

    expect(showErrorToastMock).toHaveBeenCalledWith(
      "Bad Request",
      "Invalid input, projectId is required",
      "WARNING",
      "prompts.create",
      undefined,
      "trpc",
      {
        errorOrigin: "frontend",
        errorCategory: "internal",
        trpcCode: "BAD_REQUEST",
        httpStatus: 400,
      },
    );
  });

  it("forwards the OTEL trace id to the toast when present", () => {
    trpcErrorToast(
      trpcError({
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
        path: "prompts.create",
        message: "Something went wrong",
        traceId: "abc123def456",
      }),
    );

    expect(showErrorToastMock).toHaveBeenCalledWith(
      "Internal Server Error",
      "Something went wrong",
      "ERROR",
      "prompts.create",
      "abc123def456",
      "trpc",
      {
        errorOrigin: "backend",
        errorCategory: "internal",
        trpcCode: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
      },
    );
  });

  it.each([
    ["FORBIDDEN", 403, "permission"],
    ["TOO_MANY_REQUESTS", 429, "rate_limit"],
    ["NOT_FOUND", 404, "product_state"],
    ["PAYLOAD_TOO_LARGE", 413, "resource_limit"],
    ["TIMEOUT", 524, "transient"],
  ] as const)(
    "classifies %s (%i) as %s telemetry",
    (code, httpStatus, errorCategory) => {
      trpcErrorToast(
        trpcError({
          code,
          httpStatus,
          path: "prompts.create",
          message: "Expected failure",
        }),
      );

      expect(showErrorToastMock).toHaveBeenCalledWith(
        expect.any(String),
        "Expected failure",
        expect.any(String),
        "prompts.create",
        undefined,
        "trpc",
        {
          errorOrigin: errorCategory === "transient" ? "network" : "backend",
          errorCategory,
          trpcCode: code,
          httpStatus,
        },
      );
    },
  );
});
