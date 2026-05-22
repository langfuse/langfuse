import {
  fetchWithSecureRedirects,
  type OutboundUrlValidationWhitelist,
} from "../outbound-url";
import { GoogleAuth, type GoogleAuthOptions } from "google-auth-library";
import {
  llmBaseUrlWhitelistFromEnv,
  validateLlmConnectionBaseURL,
} from "./baseUrlValidation";

const GOOGLE_AI_STUDIO_ORIGIN = "https://generativelanguage.googleapis.com";
const GOOGLE_API_KEY_HEADER = "X-Goog-Api-Key";
const MAX_GOOGLE_LLM_REDIRECTS = 10;
const VERTEX_AI_AUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
];

type GoogleApiClient = {
  hasApiKey: () => boolean;
  getProjectId: () => Promise<string>;
  fetch: (request: Request) => Promise<Response>;
};

type SecureGoogleAIStudioApiClientParams = {
  apiKey: string;
  baseURL?: string | null;
  whitelist?: OutboundUrlValidationWhitelist;
};

type SecureVertexAIApiClientParams = {
  authOptions?: GoogleAuthOptions;
  whitelist?: OutboundUrlValidationWhitelist;
  authClient?: {
    getProjectId: () => Promise<string>;
    getRequestHeaders: (url?: string) => Promise<Headers>;
  };
};

export function createSecureGoogleAIStudioApiClient({
  apiKey,
  baseURL,
  whitelist = llmBaseUrlWhitelistFromEnv(),
}: SecureGoogleAIStudioApiClientParams): GoogleApiClient {
  return {
    hasApiKey: () => true,
    getProjectId: async () => "unknown-project-id",
    fetch: async (request: Request) => {
      const url = rewriteGoogleAIStudioUrl(request.url, baseURL);

      const headers = new Headers(request.headers);
      headers.set(GOOGLE_API_KEY_HEADER, apiKey);

      return fetchGoogleLlmRequest({
        url,
        request,
        headers,
        whitelist,
        logContext: "Google AI Studio LLM base URL",
        additionalSensitiveHeaders: [GOOGLE_API_KEY_HEADER],
      });
    },
  };
}

export function createSecureVertexAIApiClient({
  authOptions,
  whitelist = llmBaseUrlWhitelistFromEnv(),
  authClient,
}: SecureVertexAIApiClientParams): GoogleApiClient {
  const googleAuth =
    authClient ??
    new GoogleAuth({
      ...authOptions,
      scopes: authOptions?.scopes ?? VERTEX_AI_AUTH_SCOPES,
    });

  return {
    hasApiKey: () => false,
    getProjectId: () => googleAuth.getProjectId(),
    fetch: async (request: Request) => {
      const headers = new Headers(request.headers);
      (await googleAuth.getRequestHeaders(request.url)).forEach(
        (value, key) => {
          if (value !== null) headers.set(key, value);
        },
      );

      return fetchGoogleLlmRequest({
        url: request.url,
        request,
        headers,
        whitelist,
        logContext: "Vertex AI LLM endpoint",
      });
    },
  };
}

export function rewriteGoogleAIStudioUrl(
  requestUrl: string,
  baseURL?: string | null,
): string {
  if (!baseURL) return requestUrl;

  const parsedRequestUrl = new URL(requestUrl);
  const parsedBaseUrl = new URL(baseURL);

  if (parsedRequestUrl.origin !== GOOGLE_AI_STUDIO_ORIGIN) {
    return requestUrl;
  }

  const basePath = parsedBaseUrl.pathname.replace(/\/$/, "");
  const requestPath = parsedRequestUrl.pathname.replace(/^\//, "");
  parsedBaseUrl.pathname = [basePath, requestPath].filter(Boolean).join("/");
  parsedBaseUrl.search = parsedRequestUrl.search;

  return parsedBaseUrl.toString();
}

async function fetchGoogleLlmRequest({
  url,
  request,
  headers,
  whitelist,
  logContext,
  additionalSensitiveHeaders,
}: {
  url: string;
  request: Request;
  headers: Headers;
  whitelist: OutboundUrlValidationWhitelist;
  logContext: string;
  additionalSensitiveHeaders?: string[];
}): Promise<Response> {
  await validateLlmConnectionBaseURL(url, whitelist);

  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.text();

  const { response } = await fetchWithSecureRedirects(
    url,
    {
      method: request.method,
      headers,
      body,
      signal: request.signal,
    },
    {
      maxRedirects: MAX_GOOGLE_LLM_REDIRECTS,
      additionalSensitiveHeaders,
      redirectValidation: {
        validateUrl: validateLlmConnectionBaseURL,
        whitelist,
        logContext,
      },
    },
  );

  return response;
}
