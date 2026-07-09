import { TRPCClientError } from "@trpc/client";
import { isNetworkConnectivityError } from "@/src/utils/api";

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
