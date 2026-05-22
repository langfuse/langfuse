import {
  fetchWithSecureRedirects,
  type OutboundUrlValidationWhitelist,
} from "../outbound-url";
import {
  llmBaseUrlWhitelistFromEnv,
  validateLlmConnectionBaseURL,
} from "./baseUrlValidation";

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
    const { url, options } = await normalizeFetchInput(input, init);

    return fetchSecureLlmUrl(url, options, {
      whitelist,
      logContext,
      additionalSensitiveHeaders,
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
  }: SecureLlmFetchParams,
): Promise<Response> {
  await validateLlmConnectionBaseURL(url, whitelist);

  const { response } = await fetchWithSecureRedirects(url, options, {
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
  if (input instanceof Request) {
    return {
      url: input.url,
      options: {
        method: input.method,
        headers: input.headers,
        body: ["GET", "HEAD"].includes(input.method)
          ? undefined
          : await input.text(),
        signal: input.signal,
        ...mergeRequestInit(input, init),
      },
    };
  }

  return {
    url: input.toString(),
    options: init ?? {},
  };
}

function mergeRequestInit(request: Request, init?: RequestInit): RequestInit {
  if (!init) return { headers: request.headers };

  return {
    ...init,
    headers: init.headers ?? request.headers,
  };
}
