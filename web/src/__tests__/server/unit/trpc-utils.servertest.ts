import { TRPCError } from "@trpc/server";
import {
  getTRPCErrorCodeFromHTTPStatusCode,
  getTRPCErrorReporting,
} from "@/src/server/utils/trpc-utils";

describe("trpc-utils", () => {
  it("maps HTTP status codes to tRPC error codes", () => {
    expect(getTRPCErrorCodeFromHTTPStatusCode(409)).toBe("CONFLICT");
    expect(getTRPCErrorCodeFromHTTPStatusCode(422)).toBe(
      "UNPROCESSABLE_CONTENT",
    );
    expect(getTRPCErrorCodeFromHTTPStatusCode(599)).toBe(
      "INTERNAL_SERVER_ERROR",
    );
  });

  it("only traces 5xx tRPC errors", () => {
    expect(
      getTRPCErrorReporting(new TRPCError({ code: "CONFLICT" })),
    ).toMatchObject({
      httpStatus: 409,
      logLevel: "warn",
      shouldTrace: false,
    });

    expect(
      getTRPCErrorReporting(new TRPCError({ code: "UNAUTHORIZED" })),
    ).toMatchObject({
      httpStatus: 401,
      logLevel: "info",
      shouldTrace: false,
    });

    expect(
      getTRPCErrorReporting(new TRPCError({ code: "NOT_FOUND" })),
    ).toMatchObject({
      httpStatus: 404,
      logLevel: "info",
      shouldTrace: false,
    });

    expect(
      getTRPCErrorReporting(new TRPCError({ code: "FORBIDDEN" })),
    ).toMatchObject({
      httpStatus: 403,
      logLevel: "warn",
      shouldTrace: false,
    });

    expect(
      getTRPCErrorReporting(new TRPCError({ code: "INTERNAL_SERVER_ERROR" })),
    ).toMatchObject({
      httpStatus: 500,
      logLevel: "error",
      shouldTrace: true,
    });
  });
});
