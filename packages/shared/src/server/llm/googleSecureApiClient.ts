import { type OutboundUrlValidationWhitelist } from "../outbound-url";
import { type ChatGoogleParams } from "@langchain/google";
import { GoogleAuth, type GoogleAuthOptions } from "google-auth-library";
import { llmBaseUrlWhitelistFromEnv } from "./baseUrlValidation";
import { fetchSecureLlmUrl } from "./secureLlmFetch";

const GOOGLE_AI_STUDIO_ORIGIN = "https://generativelanguage.googleapis.com";
const VERTEX_AI_HOST_SUFFIX = "-aiplatform.googleapis.com";
const VERTEX_AI_GLOBAL_HOST = "aiplatform.googleapis.com";
const GOOGLE_API_KEY_HEADER = "X-Goog-Api-Key";
const VERTEX_AI_AUTH_HEADER = "authorization";
const VERTEX_AI_AUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
];

type GoogleApiClient = NonNullable<ChatGoogleParams["apiClient"]>;

type SecureGoogleAIStudioApiClientParams = {
  apiKey: string;
  baseURL?: string | null;
  whitelist?: OutboundUrlValidationWhitelist;
  dispatcher?: unknown;
};

type SecureVertexAIApiClientParams = {
  authOptions?: GoogleAuthOptions;
  /**
   * When set, Vertex requests are routed through this gateway base URL instead
   * of Google's `*-aiplatform.googleapis.com` host. In this mode the gateway
   * authenticates with its own credentials (supplied via `extraHeaders`, e.g. an
   * APIM subscription key) and no Google OAuth bearer token is attached.
   */
  baseURL?: string | null;
  /**
   * Extra headers forwarded on every request. Used to carry gateway
   * authentication when `baseURL` is set.
   */
  extraHeaders?: Record<string, string>;
  whitelist?: OutboundUrlValidationWhitelist;
  dispatcher?: unknown;
};

export function createSecureGoogleAIStudioApiClient({
  apiKey,
  baseURL,
  whitelist = llmBaseUrlWhitelistFromEnv(),
  dispatcher,
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
        dispatcher,
      });
    },
  };
}

export function createSecureVertexAIApiClient({
  authOptions,
  baseURL,
  extraHeaders,
  whitelist = llmBaseUrlWhitelistFromEnv(),
  dispatcher,
}: SecureVertexAIApiClientParams): GoogleApiClient {
  // Gateway mode: route through a custom base URL and authenticate with the
  // gateway's own credentials (via extraHeaders) instead of a Google OAuth
  // bearer token. The Vertex request path (which encodes the GCP project and
  // location) is preserved so the gateway can proxy to Vertex unchanged.
  if (baseURL) {
    return {
      hasApiKey: () => false,
      getProjectId: async () => authOptions?.projectId ?? "unknown-project-id",
      fetch: async (request: Request) => {
        const url = rewriteVertexAIUrl(request.url, baseURL);

        const headers = new Headers(request.headers);
        // Never leak a Google OAuth bearer to the gateway host.
        headers.delete(VERTEX_AI_AUTH_HEADER);
        if (extraHeaders) {
          for (const [key, value] of Object.entries(extraHeaders)) {
            headers.set(key, value);
          }
        }

        return fetchGoogleLlmRequest({
          url,
          request,
          headers,
          whitelist,
          logContext: "Vertex AI gateway endpoint",
          additionalSensitiveHeaders: extraHeaders
            ? Object.keys(extraHeaders)
            : undefined,
          dispatcher,
        });
      },
    };
  }

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
        additionalSensitiveHeaders: [VERTEX_AI_AUTH_HEADER],
        dispatcher,
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

/**
 * Rewrite a Vertex AI request URL to route through a gateway base URL. Only the
 * Google Vertex hosts (`aiplatform.googleapis.com` and the regional
 * `{location}-aiplatform.googleapis.com` variants) are rewritten; any other host
 * is returned untouched. The original path and query are appended to the
 * configured base URL so the encoded GCP project/location/model are preserved.
 */
export function rewriteVertexAIUrl(
  requestUrl: string,
  baseURL?: string | null,
): string {
  if (!baseURL) return requestUrl;

  const parsedRequestUrl = new URL(requestUrl);
  const isVertexHost =
    parsedRequestUrl.hostname === VERTEX_AI_GLOBAL_HOST ||
    parsedRequestUrl.hostname.endsWith(VERTEX_AI_HOST_SUFFIX);

  if (!isVertexHost) {
    return requestUrl;
  }

  const normalizedBaseUrl = baseURL.replace(/\/$/, "");
  return `${normalizedBaseUrl}${parsedRequestUrl.pathname}${parsedRequestUrl.search}`;
}

async function fetchGoogleLlmRequest({
  url,
  request,
  headers,
  whitelist,
  logContext,
  additionalSensitiveHeaders,
  dispatcher,
}: {
  url: string;
  request: Request;
  headers: Headers;
  whitelist: OutboundUrlValidationWhitelist;
  logContext: string;
  additionalSensitiveHeaders?: string[];
  dispatcher?: unknown;
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
      dispatcher,
    },
  );
}
