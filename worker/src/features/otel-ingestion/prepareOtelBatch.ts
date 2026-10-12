import {
  validateOtelJson,
  type EarlyOtelBatch,
  type ValidatedOtelJson,
} from "@langfuse/native";
import {
  recordDistribution,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { applyIngestionMasking } from "@langfuse/shared/src/server/ee/ingestionMasking";

type PreparedInput =
  | {
      batch: EarlyOtelBatch;
      /** Neither masking nor UTF-8 normalization replaced the caller's bytes. */
      sourceUnchanged: boolean;
      error?: never;
    }
  | { batch?: never; sourceUnchanged?: never; error: string | undefined };

/**
 * Validate raw OTLP bytes and optionally extract media before the TypeScript
 * ingestion graph is built. Masking receives the normalized byte view and may
 * return a replacement body.
 */
export async function prepareOtelBatch(params: {
  bytes: Buffer;
  projectId: string;
  orgId?: string;
  propagatedHeaders?: Record<string, string>;
  extractMedia: boolean;
}): Promise<PreparedInput> {
  const { bytes, extractMedia, ...context } = params;
  const startedAt = performance.now();
  let outcome: "native" | "masking_drop" | "error" = "error";
  let originalInput: ValidatedOtelJson | undefined;
  let maskedInput: ValidatedOtelJson | undefined;
  try {
    originalInput = await validateOtelJson(bytes);
    const masking = await applyIngestionMasking(
      {
        ...context,
        data: {
          bytes: originalInput.normalizedBytes() ?? bytes,
          validated: originalInput,
        },
      },
      undefined,
      {
        body: (input) => {
          if (!(input.bytes.buffer instanceof ArrayBuffer)) {
            throw new Error(
              "masking body must have an ArrayBuffer backing store",
            );
          }
          return new Uint8Array(
            input.bytes.buffer,
            input.bytes.byteOffset,
            input.bytes.byteLength,
          );
        },
        read: async (response) => {
          const disposal = Promise.allSettled([maskedInput?.dispose()]);
          try {
            const json = stripResponseJsonBoms(
              Buffer.from(await response.arrayBuffer()),
            );
            maskedInput = await validateOtelJson(json);
            return {
              bytes: maskedInput.normalizedBytes() ?? json,
              validated: maskedInput,
            };
          } finally {
            await disposal.then(([result]) => {
              if (result.status === "rejected") throw result.reason;
            });
          }
        },
      },
    );
    if (!masking.success) {
      outcome = "masking_drop";
      return { error: masking.error };
    }
    // Release the unused input before extraction allocates its result.
    if (masking.data.validated === originalInput) {
      await maskedInput?.dispose();
    } else {
      await originalInput.dispose();
    }
    const batch = await masking.data.validated.extract(extractMedia);
    outcome = "native";
    return {
      batch,
      sourceUnchanged: masking.data.bytes === bytes,
    };
  } catch (error) {
    outcome = "error";
    throw error;
  } finally {
    await Promise.all([originalInput?.dispose(), maskedInput?.dispose()])
      .catch((error) => {
        outcome = "error";
        return Promise.reject(error);
      })
      .finally(() => {
        const tags = {
          outcome,
          extract_media: extractMedia.toString(),
        };
        recordIncrement(
          "langfuse.ingestion.otel.early_media.preparation",
          1,
          tags,
        );
        recordDistribution(
          "langfuse.ingestion.otel.early_media.preparation_duration_ms",
          performance.now() - startedAt,
          tags,
        );
      });
  }
}

// Match Node's Response.json(): accept up to two leading UTF-8 BOMs and leave
// a third for the JSON parser to reject.
function stripResponseJsonBoms(bytes: Buffer): Buffer {
  let offset = 0;
  while (
    offset < 6 &&
    bytes[offset] === 0xef &&
    bytes[offset + 1] === 0xbb &&
    bytes[offset + 2] === 0xbf
  ) {
    offset += 3;
  }
  return offset === 0 ? bytes : bytes.subarray(offset);
}
