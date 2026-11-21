import {
  OutboundUrlValidationError,
  parseOutboundUrl,
} from "../outbound-url/parse";

// Keep this module free of env and Node imports: connection forms run these
// rules in the browser before the server adds its host and DNS checks.

/** Prefix of server errors about a connection's base URL. */
export const INVALID_LLM_BASE_URL_PREFIX = "Invalid base URL: ";

export function parseLlmBaseUrl(urlString: string): URL {
  const url = parseOutboundUrl(urlString);

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new OutboundUrlValidationError(
      "protocol-not-allowed",
      "Only HTTP and HTTPS protocols are allowed",
    );
  }

  return url;
}

export function assertLlmBaseUrlHttps(url: URL, isLangfuseCloud: boolean) {
  if (isLangfuseCloud && url.protocol !== "https:") {
    throw new OutboundUrlValidationError(
      "https-required",
      "Only HTTPS base URLs are allowed on Langfuse Cloud",
    );
  }
}

/** Returns the base URL problem from a server error, or null for other errors. */
export function getInvalidLlmBaseUrlReason(errorMessage: string) {
  return errorMessage.startsWith(INVALID_LLM_BASE_URL_PREFIX)
    ? errorMessage.slice(INVALID_LLM_BASE_URL_PREFIX.length)
    : null;
}

/** The server checks hosts as well, so a URL passing here can still be rejected on save. */
export function getLlmBaseUrlFormatError(
  urlString: string,
  isLangfuseCloud: boolean,
) {
  try {
    assertLlmBaseUrlHttps(parseLlmBaseUrl(urlString), isLangfuseCloud);
    return null;
  } catch (error) {
    if (error instanceof OutboundUrlValidationError) return error.message;
    throw error;
  }
}
