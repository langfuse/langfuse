import { STATUS_CODES } from "node:http";
import { InvalidRequestError } from "@langfuse/shared";

const MAX_BODY_LENGTH = 4_000;

/**
 * A provider refused the credential under test. Saving surfaces only the
 * message; a connection test also returns the provider's answer so admins can
 * see why. Bodies are capped since a custom base URL can return anything.
 */
export class ProviderCredentialRejectedError extends InvalidRequestError {
  readonly providerResponse: {
    status: number | null;
    statusText: string | null;
    body: string;
  };

  constructor(response: ProviderAnswer) {
    super("Provider connection test failed");
    this.providerResponse = {
      status: response.status,
      statusText:
        response.status === null
          ? null
          : (STATUS_CODES[response.status] ?? null),
      body: response.body.slice(0, MAX_BODY_LENGTH),
    };
  }
}

/** AI SDK call errors carry the HTTP answer, possibly wrapped by its retries. */
export function getProviderAnswerFromCallError(error: unknown): ProviderAnswer {
  for (const candidate of [
    error,
    getProperty(error, "lastError"),
    getProperty(error, "cause"),
  ]) {
    const status = getProperty(candidate, "statusCode");
    if (typeof status === "number") {
      const body = getProperty(candidate, "responseBody");
      return {
        status,
        body: typeof body === "string" && body ? body : getMessage(candidate),
      };
    }
  }
  return { status: null, body: getMessage(error) };
}

function getProperty(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function getMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type ProviderAnswer = { status: number | null; body: string };
