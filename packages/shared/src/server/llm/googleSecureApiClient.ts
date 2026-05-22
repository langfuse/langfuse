import { type OutboundUrlValidationWhitelist } from "../outbound-url";
import { type ChatGoogleParams } from "@langchain/google";
import { GoogleAuth, type GoogleAuthOptions } from "google-auth-library";
import { llmBaseUrlWhitelistFromEnv } from "./baseUrlValidation";
import { fetchSecureLlmUrl } from "./secureLlmFetch";

const GOOGLE_AI_STUDIO_ORIGIN = "https://generativelanguage.googleapis.com";
const GOOGLE_API_KEY_HEADER = "X-Goog-Api-Key";
const VERTEX_AI_AUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
];

type GoogleApiClient = NonNullable<ChatGoogleParams["apiClient"]>;

type SecureGoogleAIStudioApiClientParams = {
  apiKey: string;
  baseURL?: string | null;
  whitelist?: OutboundUrlValidationWhitelist;
};

type SecureVertexAIApiClientParams = {
  authOptions?: GoogleAuthOptions;
  whitelist?: OutboundUrlValidationWhitelist;
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
}: SecureVertexAIApiClientParams): GoogleApiClient {
  const googleAuth = new GoogleAuth({
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

  if (parsedRequestUrl.origin !== GOOGLE_AI_STUDIO_ORIGIN) {
    return requestUrl;
  }

  // Match the previous @google/generative-ai baseUrl behavior: append the
  // generated Google path to the configured baseURL as-is.
  return `${baseURL}${parsedRequestUrl.pathname}${parsedRequestUrl.search}`;
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
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.text();

  return fetchSecureLlmUrl(
    url,
    {
      method: request.method,
      headers,
      body,
      signal: request.signal,
    },
    {
      whitelist,
      logContext,
      additionalSensitiveHeaders,
    },
  );
}
