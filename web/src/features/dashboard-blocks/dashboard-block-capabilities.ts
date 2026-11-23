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

function dashboardBlockErrorStatus(error: unknown): number | undefined {
  if (!(error instanceof TRPCClientError)) return undefined;
  switch (error.data?.code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
  }
  const response = error.meta?.response;
  return (
    error.data?.httpStatus ??
    readAnnotatedResponseStatus(error.cause) ??
    (response instanceof Response ? response.status : undefined)
  );
}

export function isDashboardBlockReadDenied(error: unknown) {
  const status = dashboardBlockErrorStatus(error);
  return status === 401 || status === 403 || status === 404;
}

function isAuthoritativeCapabilityFailure(error: unknown) {
  const status = dashboardBlockErrorStatus(error);
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    ![408, 429, 499].includes(status)
  );
}
