import type { ModelDiscoveryError } from "../types";

export type JsonRequestResult =
  | { success: true; response: Response; value: unknown }
  | { success: false; error: "timeout" };

export async function requestJson(params: {
  fetcher: typeof fetch;
  url: URL;
  headers: Record<string, string>;
}): Promise<JsonRequestResult> {
  let response: Response;
  try {
    response = await params.fetcher(params.url, {
      method: "GET",
      headers: params.headers,
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
  } catch {
    return { success: false, error: "timeout" };
  }

  return {
    success: true,
    response,
    value: await response.json().catch(() => null),
  };
}

export function standardHttpError(
  response: Response,
): ModelDiscoveryError | null {
  if (response.status === 401 || response.status === 403) return "unauthorized";
  if (response.status === 429) return "rate_limited";
  return response.ok ? null : "provider_error";
}
