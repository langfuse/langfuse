import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { RequestHeaderSchema } from "@langfuse/shared";
import {
  decrypt,
  encrypt,
  createSignatureHeader,
  generateWebhookSecret,
} from "@langfuse/shared/encryption";
import {
  createDisplayHeaders,
  decryptSecretHeaders,
  encryptSecretHeaders,
} from "@langfuse/shared/src/server";

import { REMOTE_EXPERIMENT_PROTECTED_HEADERS } from "@/src/features/datasets/remoteExperimentConstants";

export const RemoteExperimentHeadersSchema = z.record(
  z.string(),
  RequestHeaderSchema,
);
export type RemoteExperimentHeaders = z.infer<
  typeof RemoteExperimentHeadersSchema
>;

export function parseStoredRemoteExperimentHeaders(
  stored: unknown,
): RemoteExperimentHeaders {
  const parsed = RemoteExperimentHeadersSchema.safeParse(stored);
  return parsed.success ? parsed.data : {};
}

/**
 * Processes remote experiment headers following the webhook semantics:
 * - protected header names are rejected
 * - empty submitted values preserve the existing (encrypted) value, so masked
 *   secrets do not need to be resent on every update
 * - secret status changes require a value
 * - headers absent from the input are removed; `undefined` input preserves the
 *   existing config unchanged (URL-only updates)
 */
export function processRemoteExperimentHeaders(
  inputHeaders: RemoteExperimentHeaders | undefined,
  existingEncryptedHeaders: RemoteExperimentHeaders,
): {
  requestHeaders: RemoteExperimentHeaders;
  displayHeaders: RemoteExperimentHeaders;
} {
  if (!inputHeaders) {
    return {
      requestHeaders: existingEncryptedHeaders,
      displayHeaders: createDisplayHeaders(
        decryptSecretHeaders(existingEncryptedHeaders),
      ),
    };
  }

  const plaintextHeaders: RemoteExperimentHeaders = {};

  for (const [key, headerObj] of Object.entries(inputHeaders)) {
    if (REMOTE_EXPERIMENT_PROTECTED_HEADERS.includes(key.toLowerCase())) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Header "${key}" is set by Langfuse and cannot be overridden`,
      });
    }

    const existingHeader = existingEncryptedHeaders[key];

    if (headerObj.secret && headerObj.value.trim() === "" && !existingHeader) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Header "${key}" cannot be made secret without providing a value`,
      });
    }

    if (
      existingHeader &&
      headerObj.secret !== existingHeader.secret &&
      headerObj.value.trim() === ""
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Header "${key}" secret status can only be changed when providing a value`,
      });
    }

    if (headerObj.value.trim() === "" && existingHeader) {
      // Preserve the existing value; decrypt so all values below are plaintext.
      plaintextHeaders[key] = existingHeader.secret
        ? { secret: true, value: decrypt(existingHeader.value) }
        : existingHeader;
    } else if (headerObj.value.trim() !== "") {
      plaintextHeaders[key] = headerObj;
    }
    // empty value without an existing header removes it
  }

  return {
    requestHeaders: encryptSecretHeaders(plaintextHeaders),
    displayHeaders: createDisplayHeaders(plaintextHeaders),
  };
}

/**
 * Returns the (existing or newly generated) signing secret for a remote
 * experiment config. `unencryptedSecretKey` is only set when a new secret was
 * generated and must only be used for one-time display.
 */
export function ensureRemoteExperimentSecret(existing: {
  secretKey: string | null;
  displaySecretKey: string | null;
}): {
  secretKey: string;
  displaySecretKey: string;
  unencryptedSecretKey?: string;
} {
  if (existing.secretKey && existing.displaySecretKey) {
    return {
      secretKey: existing.secretKey,
      displaySecretKey: existing.displaySecretKey,
    };
  }

  const { secretKey, displaySecretKey } = generateWebhookSecret();
  return {
    secretKey: encrypt(secretKey),
    displaySecretKey,
    unencryptedSecretKey: secretKey,
  };
}

/**
 * Builds the outbound request body and headers for a remote experiment
 * trigger. Custom headers are decrypted and applied first; protected headers
 * are applied last so they always win.
 */
export function buildRemoteExperimentRequest({
  storedHeaders,
  encryptedSecretKey,
  bodyObject,
}: {
  storedHeaders: unknown;
  encryptedSecretKey: string | null;
  bodyObject: Record<string, unknown>;
}): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(bodyObject);
  const headers: Record<string, string> = {};

  const customHeaders = decryptSecretHeaders(
    parseStoredRemoteExperimentHeaders(storedHeaders),
  );
  for (const [key, headerObj] of Object.entries(customHeaders)) {
    if (REMOTE_EXPERIMENT_PROTECTED_HEADERS.includes(key.toLowerCase())) {
      continue;
    }
    headers[key] = headerObj.value;
  }

  headers["Content-Type"] = "application/json";

  if (encryptedSecretKey) {
    headers["x-langfuse-signature"] = createSignatureHeader(
      body,
      decrypt(encryptedSecretKey),
    );
  }

  return { body, headers };
}
