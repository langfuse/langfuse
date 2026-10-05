import {
  validateOtelJson,
  type EarlyOtelBatch,
  type ValidatedOtelJson,
} from "@langfuse/native";
import {
  logger,
  recordDistribution,
  recordIncrement,
  type ResourceSpan,
} from "@langfuse/shared/src/server";
import { applyIngestionMasking } from "@langfuse/shared/src/server/ee/ingestionMasking";

type ValidatedInput =
  | { validated: ValidatedOtelJson; spans?: never }
  | { validated?: never; spans: ResourceSpan[] };
type PreparedInput =
  | { batch: EarlyOtelBatch; spans?: never }
  | { batch?: never; spans: ResourceSpan[] };

function requiresTypeScriptOtel(error: unknown): boolean {
  return /surrogate|nesting limit|media reference.*ambig|number out of range|invalid UTF-8/i.test(
    String(error),
  );
}

/** Validate original bytes before masking; only the accepted payload is compacted. */
export async function prepareOtelBatch(params: {
  bytes: Buffer;
  projectId: string;
  orgId?: string;
  propagatedHeaders?: Record<string, string>;
  extractMedia: boolean;
}): Promise<PreparedInput | undefined> {
  const { bytes, extractMedia, ...context } = params;
  const startedAt = performance.now();
  let outcome: "native" | "typescript_fallback" | "masking_drop" | "error" =
    "error";
  const validators: ValidatedOtelJson[] = [];
  try {
    const validated = await validate(bytes);
    const masking = await applyIngestionMasking(
      { ...context, data: { bytes, ...validated } },
      undefined,
      {
        body: (input) => {
          // Representation fallback follows the original JS masking contract, including
          // replacement characters introduced while decoding malformed UTF-8.
          if (input.spans !== undefined) return JSON.stringify(input.spans);
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
          const bytes = Buffer.from(await response.arrayBuffer());
          return { bytes, ...(await validate(bytes)) };
        },
      },
    );
    if (!masking.success) {
      outcome = "masking_drop";
      return undefined;
    }
    // A successful callback can replace a media-heavy body. Drop the superseded Rust copy
    // before compacting the accepted response, rather than retaining both during extraction.
    await Promise.all(
      validators
        .filter((input) => input !== masking.data.validated)
        .map((input) => input.dispose()),
    );
    if (masking.data.validated) {
      try {
        const batch = await masking.data.validated.extract(extractMedia);
        outcome = "native";
        return { batch };
      } catch (error) {
        if (!requiresTypeScriptOtel(error)) throw error;
        outcome = "typescript_fallback";
        return { spans: fallback(masking.data.bytes, error) };
      }
    }
    outcome = "typescript_fallback";
    return { spans: masking.data.spans };
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

  async function validate(input: Buffer): Promise<ValidatedInput> {
    try {
      const validated = await validateOtelJson(input);
      validators.push(validated);
      return { validated };
    } catch (error) {
      // JavaScript can represent lone UTF-16 surrogates and deeper JSON than the bounded
      // native parser. Preserve those inputs through the established TS implementation.
      if (!requiresTypeScriptOtel(error)) throw error;
      return { spans: fallback(input, error) };
    }
  }

  function fallback(input: Buffer, error: unknown): ResourceSpan[] {
    const spans: ResourceSpan[] = JSON.parse(input.toString("utf8"));
    recordIncrement("langfuse.ingestion.otel.native_fallback", 1, {
      reason: "representation",
    });
    logger.warn("OTEL payload requires the TypeScript processing path", {
      projectId: context.projectId,
      error,
    });
    return spans;
  }
}
