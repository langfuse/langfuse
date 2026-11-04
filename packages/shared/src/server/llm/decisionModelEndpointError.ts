import { APICallError } from "ai";

/**
 * Proxies and gateways that lack the decision endpoint answer 404 with a body
 * the provider SDK cannot parse, which leaves only the status text "Not Found".
 * Provider-shaped 404s (for example `model_not_found`) carry parsed `data` and
 * keep their own message. The result stays a 404 APICallError so evaluator
 * error classification is unchanged.
 */
export function explainMissingDecisionEndpoint(
  error: unknown,
  endpoint: { provider: string; path: string; defaultBaseURL: string },
): unknown {
  if (
    !APICallError.isInstance(error) ||
    error.statusCode !== 404 ||
    error.data !== undefined
  ) {
    return error;
  }
  const url = error.url.split("?")[0];
  return new APICallError({
    message:
      `The decision-model endpoint was not found (POST ${url} returned 404). ` +
      `Check that the connection's base URL supports ${endpoint.provider}'s ${endpoint.path} endpoint, ` +
      `for example the default ${endpoint.defaultBaseURL}.`,
    url: error.url,
    requestBodyValues: error.requestBodyValues,
    statusCode: error.statusCode,
    responseHeaders: error.responseHeaders,
    responseBody: error.responseBody,
    isRetryable: error.isRetryable,
    cause: error,
  });
}
