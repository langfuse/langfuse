import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { readAnnotatedResponseStatus } from "@/src/utils/trpcResponseParseError";

type DashboardBlockCapabilities = { multiQuery: boolean; markdown: boolean };

export async function readDashboardBlockCapabilities({
  read,
  queryClient,
  queryKey,
}: {
  read: () => Promise<DashboardBlockCapabilities>;
  queryClient: QueryClient;
  queryKey: QueryKey;
}) {
  try {
    return await read();
  } catch (error) {
    if (isAuthoritativeCapabilityFailure(error)) {
      // Revocation must outlive a later transient read failure.
      queryClient.setQueryData<DashboardBlockCapabilities>(queryKey, {
        multiQuery: false,
        markdown: false,
      });
    }
    throw error;
  }
}

function isAuthoritativeCapabilityFailure(error: unknown) {
  if (!(error instanceof TRPCClientError)) return false;
  if (["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"].includes(error.data?.code))
    return true;
  const response = error.meta?.response;
  const status =
    error.data?.httpStatus ??
    readAnnotatedResponseStatus(error.cause) ??
    (response instanceof Response ? response.status : undefined);
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    ![408, 429, 499].includes(status)
  );
}
