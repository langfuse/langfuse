import {
  fetchWithSecureRedirects,
  type OutboundUrlValidationWhitelist,
} from "../outbound-url";
import type { Dispatcher } from "undici";
import {
  llmBaseUrlWhitelistFromEnv,
  validateLlmConnectionBaseURL,
} from "./baseUrlValidation";

const MAX_LLM_REDIRECTS = 10;

type SecureLlmFetchParams = {
  whitelist?: OutboundUrlValidationWhitelist;
  logContext: string;
  additionalSensitiveHeaders?: string[];
  dispatcher?: Dispatcher;
};

export function createSecureLlmFetch({
  whitelist = llmBaseUrlWhitelistFromEnv(),
  logContext,
  additionalSensitiveHeaders,
  dispatcher,
}: SecureLlmFetchParams): typeof fetch {
  return async (input, init) => {
    const { url, options } = await normalizeFetchInput(input, init);

    return fetchSecureLlmUrl(url, options, {
      whitelist,
      logContext,
      additionalSensitiveHeaders,
      dispatcher,
    });
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
  const fetchOptions =
    dispatcher &&
    !(options as RequestInit & { dispatcher?: Dispatcher }).dispatcher
      ? ({ ...options, dispatcher } as RequestInit)
      : options;

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
      signal: request.signal,
    },
  };
}
