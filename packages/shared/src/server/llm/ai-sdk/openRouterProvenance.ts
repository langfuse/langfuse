import { parseOutboundUrl } from "../../outbound-url/validation";
import { INTERNAL_EVAL_ENVIRONMENT_PREFIX } from "../isInternalEvalEnvironment";
import { isPlainObject } from "./providers/utils";

const OPENROUTER_TRACE_ENVIRONMENT_HEADER = "x-openrouter-trace-environment";

export function isOpenRouterEndpoint(
  baseURL: string | null | undefined,
): baseURL is string {
  if (!baseURL) return false;

  try {
    const url = parseOutboundUrl(baseURL.replace("{model}", "model"));
    if (!["http:", "https:"].includes(url.protocol)) return false;

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return hostname === "openrouter.ai" || hostname.endsWith(".openrouter.ai");
  } catch {
    return false;
  }
}

type FetchBody = NonNullable<RequestInit["body"]>;

function injectTraceEnvironmentIntoJsonBody(
  body: FetchBody | null | undefined,
  internalEnvironment: string,
  contentType: string | null,
): { body: FetchBody | null | undefined; modified: boolean } {
  if (body == null) {
    return { body, modified: false };
  }

  const normalizedContentType = contentType?.toLowerCase() ?? "";
  if (normalizedContentType && !normalizedContentType.includes("json")) {
    return { body, modified: false };
  }

  let text: string;
  if (typeof body === "string") {
    text = body;
  } else if (body instanceof Uint8Array) {
    if (!normalizedContentType.includes("json")) {
      return { body, modified: false };
    }
    text = new TextDecoder().decode(body);
  } else if (body instanceof ArrayBuffer) {
    if (!normalizedContentType.includes("json")) {
      return { body, modified: false };
    }
    text = new TextDecoder().decode(new Uint8Array(body));
  } else {
    return { body, modified: false };
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (!isPlainObject(parsed)) {
      return { body, modified: false };
    }
    const existingTrace = isPlainObject(parsed.trace) ? parsed.trace : {};
    parsed.trace = {
      ...existingTrace,
      // System-owned provenance overrides caller-supplied trace.environment so
      // OpenRouter Broadcast callbacks cannot re-enter internal pipelines.
      environment: internalEnvironment,
    };
    return { body: JSON.stringify(parsed), modified: true };
  } catch {
    return { body, modified: false };
  }
}

/**
 * Wraps an outbound fetch function to stamp OpenRouter Broadcast trace
 * provenance onto every request aimed at an OpenRouter host.
 *
 * Doing this at the HTTP transport layer ensures native OpenAI chat/responses,
 * OpenAI-compatible embeddings, Anthropic-on-OpenRouter, and decision-model
 * requests all carry both the `x-openrouter-trace-environment` header and the
 * JSON body `trace.environment` field even when an AI SDK provider strips
 * custom `providerOptions` keys.
 */
function getRequestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

async function readRawRequestBody(
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
): Promise<FetchBody | null | undefined> {
  if (init?.body !== undefined) {
    return init.body;
  }
  if (
    input instanceof Request &&
    input.method !== "GET" &&
    input.method !== "HEAD"
  ) {
    return input.clone().text();
  }
  return undefined;
}

export function wrapFetchWithOpenRouterInternalTraceProvenance(params: {
  fetchImpl: typeof fetch;
  baseURL?: string | null;
  internalEnvironment?: string;
}): typeof fetch {
  const { fetchImpl, baseURL, internalEnvironment } = params;

  if (
    !internalEnvironment ||
    !internalEnvironment.startsWith(INTERNAL_EVAL_ENVIRONMENT_PREFIX) ||
    !isOpenRouterEndpoint(baseURL)
  ) {
    return fetchImpl;
  }

  return async (input, init) => {
    const requestUrl = getRequestUrl(input);

    if (!isOpenRouterEndpoint(requestUrl)) {
      return fetchImpl(input, init);
    }

    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers.set(key, value);
      });
    }
    headers.set(OPENROUTER_TRACE_ENVIRONMENT_HEADER, internalEnvironment);

    const rawBody = await readRawRequestBody(input, init);

    const { body: updatedBody, modified } = injectTraceEnvironmentIntoJsonBody(
      rawBody,
      internalEnvironment,
      headers.get("content-type"),
    );

    if (modified) {
      headers.delete("content-length");
    }

    if (input instanceof Request) {
      return fetchImpl(
        new Request(input, {
          ...init,
          headers,
          ...(modified ? { body: updatedBody } : {}),
        }),
      );
    }

    return fetchImpl(input, {
      ...init,
      headers,
      ...(updatedBody !== undefined ? { body: updatedBody } : {}),
    });
  };
}
