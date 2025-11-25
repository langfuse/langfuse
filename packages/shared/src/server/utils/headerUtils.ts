import { encrypt, decrypt } from "../../encryption";

export function mergeHeaders(
  legacyHeaders: Record<string, string> = {},
  requestHeaders: Record<string, { secret: boolean; value: string }> = {},
): Record<string, { secret: boolean; value: string }> {
  const merged: Record<string, { secret: boolean; value: string }> = {};

  // Add legacy headers as non-secret
  for (const [key, value] of Object.entries(legacyHeaders)) {
    merged[key] = { secret: false, value };
  }

  // requestHeaders takes precedence
  for (const [key, headerObj] of Object.entries(requestHeaders)) {
    merged[key] = headerObj;
  }

  return merged;
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
