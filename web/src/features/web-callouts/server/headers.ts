import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { type WebCalloutHeaders } from "@/src/features/web-callouts/types";
import {
  WEB_CALLOUT_BLOCKED_HEADER_NAMES,
  WEB_CALLOUT_HEADER_NAME_PATTERN,
} from "@/src/features/web-callouts/headerRules";
import { decrypt, encrypt } from "@langfuse/shared/encryption";

const WEB_CALLOUT_MAX_HEADER_COUNT = 20;
const WEB_CALLOUT_MAX_HEADER_NAME_BYTES = 128;
const WEB_CALLOUT_MAX_HEADER_VALUE_BYTES = 4 * 1024;
const WEB_CALLOUT_MAX_TOTAL_HEADER_BYTES = 8 * 1024;
const WebCalloutEncryptedHeadersSchema = z.record(z.string(), z.string());

export type StoredWebCalloutHeaders = {
  requestHeaders: string | null;
  requestHeaderKeys: string[];
};

export const processHeadersForStorage = ({
  inputHeaders,
  existingHeaders,
}: {
  inputHeaders: WebCalloutHeaders;
  existingHeaders: WebCalloutHeaders;
}): StoredWebCalloutHeaders => {
  const requestHeaders: WebCalloutHeaders = {};
  const normalizedHeaderNames = new Set<string>();

  for (const [rawName, rawValue] of Object.entries(inputHeaders)) {
    const name = rawName.trim();
    const value = rawValue.trim();

    if (!name) {
      continue;
    }

    validateHeaderName(name);
    const normalizedName = name.toLowerCase();

    if (normalizedHeaderNames.has(normalizedName)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Header "${name}" is configured more than once.`,
      });
    }
    normalizedHeaderNames.add(normalizedName);

    if (value) {
      requestHeaders[name] = value;
      continue;
    }

    const existingValue = findExistingHeaderValue(name, existingHeaders);
    if (existingValue !== undefined) {
      requestHeaders[name] = existingValue;
      continue;
    }

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Header "${name}" value is required when adding or renaming a header.`,
    });
  }

  assertHeaderLimits(requestHeaders);

  const requestHeaderKeys = Object.keys(requestHeaders);

  return {
    requestHeaders:
      requestHeaderKeys.length > 0
        ? encrypt(JSON.stringify(requestHeaders))
        : null,
    requestHeaderKeys,
  };
};

export const decryptWebCalloutHeaders = (
  storedHeaders: string | null | undefined,
): WebCalloutHeaders => {
  if (!storedHeaders) {
    return {};
  }

  try {
    return WebCalloutEncryptedHeadersSchema.parse(
      JSON.parse(decrypt(storedHeaders)),
    );
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Failed to decrypt web callout headers. Please update the web callout configuration.",
    });
  }
};

const findExistingHeaderValue = (
  name: string,
  existingHeaders: WebCalloutHeaders,
) => {
  const existingName = Object.keys(existingHeaders).find(
    (headerName) => headerName.toLowerCase() === name.toLowerCase(),
  );

  return existingName ? existingHeaders[existingName] : undefined;
};

const assertHeaderLimits = (headers: WebCalloutHeaders) => {
  const entries = Object.entries(headers);
  if (entries.length > WEB_CALLOUT_MAX_HEADER_COUNT) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `At most ${WEB_CALLOUT_MAX_HEADER_COUNT} request headers can be configured.`,
    });
  }

  let totalHeaderBytes = 0;

  for (const [name, value] of entries) {
    const nameBytes = Buffer.byteLength(name, "utf8");
    if (nameBytes > WEB_CALLOUT_MAX_HEADER_NAME_BYTES) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Header "${name}" name must be at most ${WEB_CALLOUT_MAX_HEADER_NAME_BYTES} bytes.`,
      });
    }

    const valueBytes = Buffer.byteLength(value, "utf8");
    if (valueBytes > WEB_CALLOUT_MAX_HEADER_VALUE_BYTES) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Header "${name}" value must be at most ${WEB_CALLOUT_MAX_HEADER_VALUE_BYTES} bytes.`,
      });
    }

    totalHeaderBytes += nameBytes + valueBytes;
  }

  if (totalHeaderBytes > WEB_CALLOUT_MAX_TOTAL_HEADER_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Request headers must be at most ${WEB_CALLOUT_MAX_TOTAL_HEADER_BYTES} bytes total.`,
    });
  }
};

const validateHeaderName = (name: string) => {
  const lowerName = name.toLowerCase();

  if (!WEB_CALLOUT_HEADER_NAME_PATTERN.test(name)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Header "${name}" has an invalid name.`,
    });
  }

  if (WEB_CALLOUT_BLOCKED_HEADER_NAMES.has(lowerName)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Header "${name}" cannot be configured manually.`,
    });
  }
};
