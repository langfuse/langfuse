import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { RequestHeaderSchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
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
 * Single read path for remote experiment configuration including the
 * secret-bearing columns that are globally omitted from Prisma results
 * (see db.ts). Routes must use this helper instead of selecting
 * `remoteExperimentSecretKey` / `remoteExperimentRequestHeaders` directly, so
 * secret access stays auditable in one place.
 */
export async function getRemoteExperimentConfigWithSecrets({
  projectId,
  datasetId,
}: {
  projectId: string;
  datasetId: string;
}) {
  return prisma.dataset.findUnique({
    where: {
      id_projectId: { id: datasetId, projectId },
    },
    select: {
      id: true,
      name: true,
      remoteExperimentUrl: true,
      remoteExperimentPayload: true,
      remoteExperimentEnabled: true,
      remoteExperimentSecretKey: true,
      remoteExperimentDisplaySecretKey: true,
      remoteExperimentRequestHeaders: true,
    },
  });
}

/**
 * Processes remote experiment headers following the webhook semantics:
 * - header names are normalized to lowercase (HTTP headers are
 *   case-insensitive); duplicate names that differ only in casing are rejected
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

  // Lookups against stored headers are case-insensitive so changing the casing
  // of a name cannot create duplicates or orphan an existing secret.
  const existingByLowerKey: RemoteExperimentHeaders = Object.fromEntries(
    Object.entries(existingEncryptedHeaders).map(([k, v]) => [
      k.toLowerCase(),
      v,
    ]),
  );

  const plaintextHeaders: RemoteExperimentHeaders = {};
  const seenKeys = new Set<string>();

  for (const [rawKey, headerObj] of Object.entries(inputHeaders)) {
    const key = rawKey.trim().toLowerCase();
    if (!key) continue;

    if (seenKeys.has(key)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Duplicate header "${rawKey}" (header names are case-insensitive)`,
      });
    }
    seenKeys.add(key);

    if (REMOTE_EXPERIMENT_PROTECTED_HEADERS.includes(key)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Header "${rawKey}" is set by Langfuse and cannot be overridden`,
      });
    }

    const existingHeader = existingByLowerKey[key];

    if (headerObj.secret && headerObj.value.trim() === "" && !existingHeader) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Header "${rawKey}" cannot be made secret without providing a value`,
      });
    }

    if (
      existingHeader &&
      headerObj.secret !== existingHeader.secret &&
      headerObj.value.trim() === ""
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Header "${rawKey}" secret status can only be changed when providing a value`,
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
 * are applied last so they always win. `sensitiveHeaderNames` lists the
 * secret custom headers and must be passed to `fetchWithSecureRedirects` as
 * `additionalSensitiveHeaders` so they are stripped on cross-origin redirects.
 */
export function buildRemoteExperimentRequest({
  storedHeaders,
  encryptedSecretKey,
  bodyObject,
}: {
  storedHeaders: unknown;
  encryptedSecretKey: string | null;
  bodyObject: Record<string, unknown>;
}): {
  body: string;
  headers: Record<string, string>;
  sensitiveHeaderNames: string[];
} {
  const body = JSON.stringify(bodyObject);
  const headers: Record<string, string> = {};
  const sensitiveHeaderNames: string[] = [];

  const customHeaders = decryptSecretHeaders(
    parseStoredRemoteExperimentHeaders(storedHeaders),
  );
  for (const [key, headerObj] of Object.entries(customHeaders)) {
    if (REMOTE_EXPERIMENT_PROTECTED_HEADERS.includes(key.toLowerCase())) {
      continue;
    }
    headers[key] = headerObj.value;
    if (headerObj.secret) {
      sensitiveHeaderNames.push(key);
    }
  }

  headers["Content-Type"] = "application/json";

  if (encryptedSecretKey) {
    headers["x-langfuse-signature"] = createSignatureHeader(
      body,
      decrypt(encryptedSecretKey),
    );
  }

  return { body, headers, sensitiveHeaderNames };
}
