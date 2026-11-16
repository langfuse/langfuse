import { decryptAndParseExtraHeaders } from "./utils";

/**
 * Merges an update's extra headers with the stored ones. A blank value keeps the
 * stored value for that name, because stored values are never sent back to the
 * client. A new base URL drops the stored values so they cannot leak to it.
 */
export function resolveUpdatedExtraHeaders(params: {
  inputHeaders: Record<string, string | null | undefined> | undefined;
  storedHeaders: string | null;
  isBaseURLChanged: boolean;
}): Record<string, string> | undefined {
  const existingHeaders: Record<string, string> = params.isBaseURLChanged
    ? {}
    : (decryptAndParseExtraHeaders(params.storedHeaders) ?? {});

  if (params.inputHeaders === undefined) {
    return Object.keys(existingHeaders).length > 0
      ? existingHeaders
      : undefined;
  }

  const extraHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(params.inputHeaders)) {
    if (value === null || value === undefined || value === "") {
      if (existingHeaders[key] !== undefined) {
        extraHeaders[key] = existingHeaders[key];
      }
    } else {
      extraHeaders[key] = value;
    }
  }

  return Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined;
}
