import {
  addSecureOutboundConnectionValidation,
  getOutboundProxyDispatcher,
  llmBaseUrlWhitelistFromEnv,
} from "@langfuse/shared/src/server";

import type { ModelDiscoveryError } from "../types";

const CUSTOM_ORIGIN_LOG_CONTEXT = "AI gateway custom provider";

/** Fetch options for a tenant-supplied CUSTOM origin. The socket re-validates
 * the resolved IP at connect time, so a host cannot rebind to a private
 * address after save-time validation; the proxy dispatcher applies the same
 * check. Redirects are refused. */
export function withCustomOriginConnectionValidation(
  init: RequestInit,
): RequestInit {
  const whitelist = llmBaseUrlWhitelistFromEnv();
  const options: RequestInit = { ...init, redirect: "error" };
  // Typed as unknown: fetch's RequestInit types `dispatcher` via
  // undici-types, which drifts structurally from the undici package.
  const proxyDispatcher: unknown = getOutboundProxyDispatcher({
    whitelist,
    logContext: CUSTOM_ORIGIN_LOG_CONTEXT,
  });
  if (proxyDispatcher) {
    return { ...options, dispatcher: proxyDispatcher } as RequestInit;
  }
  return addSecureOutboundConnectionValidation(options, {
    whitelist,
    logContext: CUSTOM_ORIGIN_LOG_CONTEXT,
  });
}

/** Caps upstream JSON bodies so a hostile origin cannot exhaust Web memory. */
const MAX_JSON_BYTES = 4 * 1024 * 1024;

export type JsonRequestResult =
  | {
      success: true;
      response: Response;
      /** `undefined` when the body is not valid JSON. */
      value: unknown;
    }
  | { success: false; error: "timeout" | "provider_error" };

export async function requestJson(params: {
  fetcher: typeof fetch;
  url: URL;
  headers: Record<string, string>;
  /** Set for tenant-supplied CUSTOM origins; see
   * `withCustomOriginConnectionValidation`. */
  customOrigin?: boolean;
}): Promise<JsonRequestResult> {
  const init: RequestInit = {
    method: "GET",
    headers: params.headers,
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  };
  let response: Response;
  try {
    response = await params.fetcher(
      params.url,
      params.customOrigin ? withCustomOriginConnectionValidation(init) : init,
    );
  } catch {
    return { success: false, error: "timeout" };
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_JSON_BYTES) {
    await response.body?.cancel().catch(() => {});
    return { success: false, error: "provider_error" };
  }
  let text: string;
  try {
    text = await readBoundedText(response, MAX_JSON_BYTES);
  } catch {
    return { success: false, error: "provider_error" };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = undefined;
  }
  return { success: true, response, value };
}

/** Reads at most `maxBytes` of the body; a longer body cancels the stream
 * and throws. */
export async function readBoundedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("response body exceeds the JSON size cap");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export function standardHttpError(
  response: Response,
): ModelDiscoveryError | null {
  if (response.status === 401 || response.status === 403) return "unauthorized";
  if (response.status === 429) return "rate_limited";
  return response.ok ? null : "provider_error";
}
