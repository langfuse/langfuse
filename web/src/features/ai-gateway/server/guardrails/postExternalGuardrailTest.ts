import { InvalidRequestError } from "@langfuse/shared";

import { ProviderCredentialRejectedError } from "@/src/features/ai-gateway/server/provider/connection/ProviderCredentialRejectedError";
import { getGatewayFetch } from "@/src/features/ai-gateway/server/provider/getGatewayFetch";

const TEST_TIMEOUT_MS = 10_000;
const TEST_FAILED_MESSAGE = "Guardrail test failed";

/**
 * Sends one test request to an external guardrail provider with its API key
 * as a bearer token. Throws `ProviderCredentialRejectedError` when the provider
 * is unreachable, rejects the request, or answers in an unexpected shape.
 */
export async function postExternalGuardrailTest(params: {
  url: string;
  apiKey: string;
  body: unknown;
  providerName: string;
  unreachableMessage: string;
  isExpectedResponse: (json: unknown) => boolean;
}) {
  const fetcher = getGatewayFetch({
    baseURL: null,
    extraHeaders: {},
    logContext: `AI Gateway ${params.providerName} guardrail validation`,
  });

  let response: Response;
  try {
    response = await fetcher(params.url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(params.body),
    });
  } catch (error) {
    if (error instanceof InvalidRequestError) throw error;
    throw new ProviderCredentialRejectedError(
      { status: null, body: params.unreachableMessage },
      TEST_FAILED_MESSAGE,
    );
  }

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    throw new ProviderCredentialRejectedError(
      {
        status: response.status,
        body:
          body ||
          response.statusText ||
          `${params.providerName} rejected the request.`,
      },
      TEST_FAILED_MESSAGE,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }
  if (!params.isExpectedResponse(json)) {
    throw new ProviderCredentialRejectedError(
      {
        status: response.status,
        body: `Unexpected response from ${params.providerName}.`,
      },
      TEST_FAILED_MESSAGE,
    );
  }
}
