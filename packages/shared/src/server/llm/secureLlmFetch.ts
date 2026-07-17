import {
  CircularRedirectError,
  fetchWithSecureRedirects,
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
  dispatcher?: unknown;
};

export function createSecureLlmFetch({
  whitelist = llmBaseUrlWhitelistFromEnv(),
  logContext,
  additionalSensitiveHeaders,
  dispatcher,
}: SecureLlmFetchParams): typeof fetch {
  return async (input, init) => {
    try {
      const { url, options } = await normalizeFetchInput(input, init);

      return await fetchSecureLlmUrl(url, options, {
        whitelist,
        logContext,
        additionalSensitiveHeaders,
        dispatcher,
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
    dispatcher,
  }: SecureLlmFetchParams,
): Promise<Response> {
  await validateLlmConnectionBaseURL(url, whitelist);
  const optionsWithoutDispatcher = stripCallerDispatcher(options);
  // If we have a proxy dispatcher (HTTPS_PROXY), attach it here so the
  // outbound connection traverses the operator's proxy. Otherwise
  // fetchWithSecureRedirects will inject the secure-lookup dispatcher.
  const fetchOptions: RequestInit = dispatcher
    ? ({ ...optionsWithoutDispatcher, dispatcher } as RequestInit)
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
