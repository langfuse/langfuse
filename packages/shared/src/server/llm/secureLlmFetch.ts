import {
  CircularRedirectError,
  fetchWithSecureRedirects,
  getOutboundProxyDispatcher,
  MaxRedirectsExceededError,
  OutboundUrlValidationError,
  RedirectValidationError,
  type OutboundUrlValidationWhitelist,
  type RequestInitWithDispatcher,
} from "../outbound-url";
import {
  llmBaseUrlWhitelistFromEnv,
  validateLlmConnectionBaseURL,
} from "./baseUrlValidation";
import { LLMValidationError } from "./errors";

const MAX_LLM_REDIRECTS = 10;

type SecureLlmFetchParams = {
  whitelist?: OutboundUrlValidationWhitelist;
  logContext: string;
  additionalSensitiveHeaders?: string[];
};

export function createSecureLlmFetch({
  whitelist = llmBaseUrlWhitelistFromEnv(),
  logContext,
  additionalSensitiveHeaders,
}: SecureLlmFetchParams): typeof fetch {
  return async (input, init) => {
    try {
      const { url, options } = await normalizeFetchInput(input, init);

      return await fetchSecureLlmUrl(url, options, {
        whitelist,
        logContext,
        additionalSensitiveHeaders,
      });
    } catch (cause) {
      const validationError = findSecureLlmValidationError(cause);
      if (!validationError) throw cause;

      throw new LLMValidationError({
        code:
          validationError instanceof OutboundUrlValidationError &&
          validationError.code === "dns-lookup-failed"
            ? "endpoint-unreachable"
            : "invalid-connection",
        message: validationError.message,
        cause,
      });
    }
  };
}

export async function fetchSecureLlmUrl(
  url: string,
  options: RequestInit,
  {
    whitelist = llmBaseUrlWhitelistFromEnv(),
    logContext,
    additionalSensitiveHeaders,
  }: SecureLlmFetchParams,
): Promise<Response> {
  await validateLlmConnectionBaseURL(url, whitelist);
  const optionsWithoutDispatcher = stripCallerDispatcher(options);
  // If the operator configured HTTPS_PROXY, attach the NO_PROXY-aware proxy
  // dispatcher: proxied origins traverse the operator's proxy while NO_PROXY
  // matches connect directly through the secure-lookup dispatcher. Without a
  // proxy, fetchWithSecureRedirects will inject the secure-lookup dispatcher.
  // Typed as unknown at this boundary: fetch's RequestInit types dispatcher
  // via undici-types, which structurally drifts from the undici package's
  // Dispatcher across versions.
  const proxyDispatcher: unknown = getOutboundProxyDispatcher({
    whitelist,
    logContext,
  });
  const fetchOptions: RequestInit = proxyDispatcher
    ? ({
        ...optionsWithoutDispatcher,
        dispatcher: proxyDispatcher,
      } as RequestInit)
    : optionsWithoutDispatcher;

  const { response } = await fetchWithSecureRedirects(url, fetchOptions, {
    maxRedirects: MAX_LLM_REDIRECTS,
    additionalSensitiveHeaders,
    redirectValidation: {
      validateUrl: validateLlmConnectionBaseURL,
      whitelist,
      logContext,
    },
  });

  return response;
}

function stripCallerDispatcher(options: RequestInit): RequestInit {
  const fetchOptions = { ...options } as RequestInitWithDispatcher;
  delete fetchOptions.dispatcher;
  return fetchOptions;
}

async function normalizeFetchInput(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
): Promise<{ url: string; options: RequestInit }> {
  const request = new Request(input, init);

  return {
    url: request.url,
    options: {
      ...init,
      method: request.method,
      headers: request.headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : await request.text(),
      // Never forward request.signal: undici links init.signal to it through
      // a WeakRef'd AbortController owned by the temporary Request above, so
      // once GC collects the Request, aborts (e.g. the AI SDK engine's native
      // timeout) silently stop propagating and the HTTP request runs
      // unbounded. Forward the caller's own signal instead.
      signal: init?.signal ?? (input instanceof Request ? input.signal : null),
    },
  };
}

function findSecureLlmValidationError(error: unknown): Error | undefined {
  const visited = new Set<unknown>();
  let current = error;

  while (current !== null && current !== undefined && !visited.has(current)) {
    visited.add(current);
    if (
      current instanceof OutboundUrlValidationError ||
      current instanceof RedirectValidationError ||
      current instanceof MaxRedirectsExceededError ||
      current instanceof CircularRedirectError
    ) {
      return current;
    }

    current =
      typeof current === "object" && "cause" in current
        ? current.cause
        : undefined;
  }

  return undefined;
}
