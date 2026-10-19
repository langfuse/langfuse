import {
  extractOtelMedia,
  hasOtelMediaCandidate,
  validateOtelJson,
  type EarlyOtelBatch,
  type ValidatedOtelJson,
} from "@langfuse/native";
import {
  recordDistribution,
  recordIncrement,
  type ResourceSpan,
} from "@langfuse/shared/src/server";
import {
  applyIngestionMasking,
  isIngestionMaskingEnabled,
} from "@langfuse/shared/src/server/ee/ingestionMasking";

/** Limits synchronous marker scanning so small marker-free inputs avoid a native task and copy. */
const MAX_SYNC_MEDIA_CHECK_BYTES = 128 * 1024;

type PreparedInput =
  | {
      /** Absent when preprocessing is unnecessary; the caller must still parse JSON. */
      batch?: EarlyOtelBatch;
      /** Neither masking nor UTF-8 normalization replaced the caller's bytes. */
      sourceUnchanged: boolean;
      error?: never;
    }
  | { batch?: never; sourceUnchanged?: never; error: string | undefined };

/**
 * Extract media before the ingestion graph is built. Without masking, marker-free
 * input skips native validation; the consumer's JSON parser still validates it.
 * Masking always receives validated, normalized bytes.
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
  let outcome: "native" | "unchanged" | "masking_drop" | "error" = "error";
  let codepath: "inline_check" | "uv_dispatch" | "disabled" = "disabled";
  let originalInput: ValidatedOtelJson | undefined;
  let maskedInput: ValidatedOtelJson | undefined;
  try {
    if (!isIngestionMaskingEnabled()) {
      codepath = extractMedia ? "inline_check" : "disabled";
      const inputStartedAt = performance.now();
      const needsExtraction =
        extractMedia &&
        (bytes.length > MAX_SYNC_MEDIA_CHECK_BYTES ||
          hasOtelMediaCandidate(bytes));
      if (needsExtraction) codepath = "uv_dispatch";
      const extraction = needsExtraction ? extractOtelMedia(bytes) : null;
      recordDistribution(
        "langfuse.ingestion.otel.main_thread_duration_ms",
        performance.now() - inputStartedAt,
        { phase: "input_handling", media_path: "early" },
      );
      const batch = needsExtraction ? await extraction : null;
      outcome = batch ? "native" : "unchanged";
      return { batch: batch ?? undefined, sourceUnchanged: !batch };
    }
    codepath = "uv_dispatch";
    originalInput = await validateOtelJson(bytes);
    const masking = await applyIngestionMasking(
      {
        ...context,
        data: {
          bytes:
            measureOtelMainThread("native_result", () =>
              originalInput!.normalizedBytes(),
            ) ?? bytes,
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
              bytes:
                measureOtelMainThread("native_result", () =>
                  maskedInput!.normalizedBytes(),
                ) ?? json,
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
          codepath,
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

/** Parse for TypeScript consumers. The caller owns the returned batch; failures release it. */
export async function parsePreparedOtelBatch(
  prepared: { batch?: EarlyOtelBatch; sourceUnchanged: boolean },
  downloadedBytes: Uint8Array,
): Promise<{ resourceSpans: ResourceSpan[]; batch?: EarlyOtelBatch }> {
  let batch: EarlyOtelBatch | undefined = prepared.batch;
  try {
    let json: Buffer;
    if (!batch || (prepared.sourceUnchanged && batch.mediaCount() === 0)) {
      // Free Rust's duplicate before parsing the unchanged download. An external
      // Buffer would retain that allocation until Node collects it.
      await batch?.dispose();
      batch = undefined;
      json = Buffer.from(
        downloadedBytes.buffer,
        downloadedBytes.byteOffset,
        downloadedBytes.byteLength,
      );
    } else {
      json = measureOtelMainThread("native_result", () =>
        batch!.takeJsonBuffer(),
      );
    }
    return measureOtelMainThread("input_json", () => ({
      resourceSpans: JSON.parse(json.toString("utf8")),
      batch,
    }));
  } catch (error) {
    await batch?.dispose();
    throw error;
  }
}

// Measure synchronous result handling; awaited native work stays outside.
function measureOtelMainThread<T>(phase: string, work: () => T): T {
  const startedAt = performance.now();
  try {
    return work();
  } finally {
    recordDistribution(
      "langfuse.ingestion.otel.main_thread_duration_ms",
      performance.now() - startedAt,
      { phase, media_path: "early" },
    );
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
