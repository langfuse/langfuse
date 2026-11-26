import { encrypt, decrypt, createSignatureHeader } from "../../encryption";
import {
  WebhookDefaultHeaders,
  WebhookProtectedHeaders,
  WebhookSignatureHeader,
} from "../../domain/webhooks";

export type RequestHeaders = Record<string, { secret: boolean; value: string }>;

/**
 * Builds the headers shared by webhook-compatible outbound requests.
 * Custom secret values must already be decrypted by the caller and are only
 * kept in memory for the duration of the request.
 */
export function buildWebhookRequestHeaders({
  customHeaders = {},
  body,
  signingSecret,
}: {
  customHeaders?: RequestHeaders;
  body: string;
  signingSecret?: string;
}): {
  headers: Record<string, string>;
  sensitiveHeaderNames: string[];
} {
  const headers: Record<string, string> = {};
  const sensitiveHeaderNames: string[] = [];

  for (const [key, headerObj] of Object.entries(customHeaders)) {
    if (WebhookProtectedHeaders.includes(key.toLowerCase())) {
      continue;
    }

    headers[key] = headerObj.value;
    if (headerObj.secret) {
      sensitiveHeaderNames.push(key);
    }
  }

  Object.assign(headers, WebhookDefaultHeaders);

  if (signingSecret) {
    headers[WebhookSignatureHeader] = createSignatureHeader(
      body,
      signingSecret,
    );
  }

  return { headers, sensitiveHeaderNames };
}

/**
 * Merges the deprecated plaintext `headers` field into `requestHeaders`.
 * Legacy headers predate the secret flag and commonly carry credentials, so
 * they are treated as secret: masked on display and encrypted on the next
 * write. Their values are plaintext, so `requestHeaders` must already be
 * decrypted (or be passed to `encryptSecretHeaders` afterwards).
 */
export function mergeHeaders(
  legacyHeaders: Record<string, string> = {},
  requestHeaders: Record<string, { secret: boolean; value: string }> = {},
): Record<string, { secret: boolean; value: string }> {
  const merged: Record<string, { secret: boolean; value: string }> = {};

  for (const [key, value] of Object.entries(legacyHeaders)) {
    merged[key] = { secret: true, value };
  }

  // requestHeaders takes precedence
  for (const [key, headerObj] of Object.entries(requestHeaders)) {
    merged[key] = headerObj;
  }

  return merged;
}

/**
 * Legacy plaintext headers that no `requestHeaders` entry overrides, flagged
 * secret. Overridden keys are dropped before any decryption, so a
 * `requestHeaders` value that fails to decrypt never falls back to its stale
 * legacy value.
 */
export function getLegacyOnlyHeaders(config: {
  headers?: Record<string, string>;
  requestHeaders?: RequestHeaders;
}): RequestHeaders {
  const requestHeaders = config.requestHeaders ?? {};
  return mergeHeaders(
    Object.fromEntries(
      Object.entries(config.headers ?? {}).filter(
        ([key]) => !(key in requestHeaders),
      ),
    ),
  );
}

export function createDisplayHeaders(
  mergedHeaders: Record<string, { secret: boolean; value: string }>,
): Record<string, { secret: boolean; value: string }> {
  const displayHeaders: Record<string, { secret: boolean; value: string }> = {};

  for (const [key, headerObj] of Object.entries(mergedHeaders)) {
    displayHeaders[key] = {
      secret: headerObj.secret,
      value: headerObj.secret
        ? maskSecretValue(headerObj.value)
        : headerObj.value,
    };
  }

  return displayHeaders;
}

export function encryptSecretHeaders(
  headers: Record<string, { secret: boolean; value: string }>,
): Record<string, { secret: boolean; value: string }> {
  const processedRequestHeaders: Record<
    string,
    { secret: boolean; value: string }
  > = {};

  for (const [key, headerObj] of Object.entries(headers)) {
    if (headerObj.secret) {
      processedRequestHeaders[key] = {
        secret: true,
        value: encrypt(headerObj.value),
      };
    } else {
      processedRequestHeaders[key] = { secret: false, value: headerObj.value };
    }
  }

  return processedRequestHeaders;
}

export function decryptSecretHeaders(
  requestHeaders: Record<string, { secret: boolean; value: string }>,
): Record<string, { secret: boolean; value: string }> {
  const decryptedRequestHeaders: Record<
    string,
    { secret: boolean; value: string }
  > = {};

  for (const [key, headerObj] of Object.entries(requestHeaders)) {
    if (headerObj.secret) {
      try {
        decryptedRequestHeaders[key] = {
          secret: true,
          value: decrypt(headerObj.value),
        };
      } catch (error) {
        console.error(`Failed to decrypt header ${key}:`, error);
      }
    } else {
      decryptedRequestHeaders[key] = { secret: false, value: headerObj.value };
    }
  }

  return decryptedRequestHeaders;
}

function maskSecretValue(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
}
