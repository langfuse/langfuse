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
    );
  });
});
