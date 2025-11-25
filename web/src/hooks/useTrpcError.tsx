import { TRPCClientError } from "@trpc/client";

export function useTrpcError(
  error: unknown | null,
  silentHttpCodes: number[],
): { isSilentError: boolean } {
  return {
    isSilentError:
      error instanceof TRPCClientError &&
      typeof error.data?.httpStatus === "number" &&
      silentHttpCodes.includes(error.data?.httpStatus),
  };
}
