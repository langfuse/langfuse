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

type NativeInput = {
  bytes: Buffer;
  validated: ValidatedOtelJson;
};

type PreparedInput =
  | { batch: EarlyOtelBatch; error?: never }
  | { batch?: never; error: string | undefined };

/**
 * Validate and optionally compact an OTEL document without constructing the
 * TypeScript span graph. OTLP receiver sanitization replaces malformed UTF-8
 * with U+FFFD; masking receives the same bytes accepted by the native validator.
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
  const validators: ValidatedOtelJson[] = [];
  try {
    const validated = await validate(bytes);
    const masking = await applyIngestionMasking(
      { ...context, data: validated },
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
          return validate(Buffer.from(await response.arrayBuffer()));
        },
      },
    );
    if (!masking.success) {
      outcome = "masking_drop";
      return { error: masking.error };
    }
    // A successful callback can replace a media-heavy body. Drop the superseded Rust copy
    // before compacting the accepted response, rather than retaining both during extraction.
    await Promise.all(
      validators
        .filter((input) => input !== masking.data.validated)
        .map((input) => input.dispose()),
    );
    const batch = await masking.data.validated.extract(extractMedia);
    outcome = "native";
    return { batch };
  } catch (error) {
    outcome = "error";
    throw error;
  } finally {
    await Promise.all(validators.map((input) => input.dispose()))
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

  async function validate(input: Buffer): Promise<NativeInput> {
    const validated = await validateOtelJson(input);
    validators.push(validated);
    return {
      bytes: validated.normalizedBytes() ?? input,
      validated,
    };
  }
}
