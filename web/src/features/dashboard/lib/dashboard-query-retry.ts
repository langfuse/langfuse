export const DASHBOARD_QUERY_SILENT_HTTP_CODES = [408, 504, 524] as const;

const TIMEOUT_HTTP_STATUSES = DASHBOARD_QUERY_SILENT_HTTP_CODES;

export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    data?: { httpStatus?: number; code?: string };
    message?: string;
  };
  const status = e.data?.httpStatus;
  const code = e.data?.code;
  const message = (e.message ?? "").toLowerCase();
  if (
    status != null &&
    TIMEOUT_HTTP_STATUSES.includes(
      status as (typeof TIMEOUT_HTTP_STATUSES)[number],
    )
  )
    return true;
  if (code === "TIMEOUT") return true;
  if (message.includes("timeout") || message.includes("timed out")) return true;
  return false;
}

const MAX_RETRIES = 2;

export function dashboardQueryRetry(
  failureCount: number,
  error: unknown,
): boolean {
  if (isTimeoutError(error)) return false;
  return failureCount < MAX_RETRIES;
}

export const dashboardExecuteQueryOptions = {
  meta: { silentHttpCodes: DASHBOARD_QUERY_SILENT_HTTP_CODES },
  retry: dashboardQueryRetry,
};
