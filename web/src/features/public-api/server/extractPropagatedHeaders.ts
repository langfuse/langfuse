/**
 * Filter incoming HTTP headers down to the allow-list configured via
 * `LANGFUSE_INGESTION_MASKING_PROPAGATED_HEADERS`. Names in the allow-list
 * are already lowercased (see env parsing in `packages/shared/src/env.ts`),
 * and Node lowercases `req.headers` keys, so the comparison is case-insensitive
 * by construction.
 *
 * Returns only string-valued headers; array-valued headers (set when a header
 * appears multiple times on the request) are skipped to keep the downstream
 * `Record<string, string>` contract honest.
 */
export function extractPropagatedHeaders(
  reqHeaders: Record<string, string | string[] | undefined>,
  propagatedHeaderNames: readonly string[],
): Record<string, string> {
  const propagatedHeaders: Record<string, string> = {};
  for (const headerName of propagatedHeaderNames) {
    const value = reqHeaders[headerName];
    if (typeof value === "string") {
      propagatedHeaders[headerName] = value;
    }
  }
  return propagatedHeaders;
}
