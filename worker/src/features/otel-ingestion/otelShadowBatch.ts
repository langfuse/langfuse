import { recordIncrement } from "@langfuse/shared/src/server";
import { getDeterministicSamplingValue } from "../evaluation/deterministicSampling";

export type OtelShadowOutcome = "inserted" | "empty" | "dropped" | "exception";

export type OtelShadowErrorStage =
  | "none"
  | "primary_parse"
  | "primary_convert"
  | "primary_process"
  | "primary_writer"
  | "shadow_prepare"
  | "shadow_process"
  | "shadow_writer";

export type OtelShadowPairClassification =
  | "match"
  | "primary_only_failure"
  | "shadow_only_failure"
  | "both_failed"
  | "primary_empty"
  | "shadow_empty"
  | "both_empty";

export function classifyOtelShadowPair(
  primary: OtelShadowOutcome,
  shadow: OtelShadowOutcome,
): OtelShadowPairClassification {
  const primaryFailed = primary === "exception" || primary === "dropped";
  const shadowFailed = shadow === "exception" || shadow === "dropped";
  if (primaryFailed && shadowFailed) return "both_failed";
  if (primaryFailed) return "primary_only_failure";
  if (shadowFailed) return "shadow_only_failure";
  if (primary === "empty" && shadow === "empty") return "both_empty";
  if (primary === "empty") return "primary_empty";
  if (shadow === "empty") return "shadow_empty";
  return "match";
}

// Keep sampled source files in memory until ClickHouse acknowledges their rows.
// Saturated workers skip comparisons while continuing production ingestion.
const MAX_PENDING_BATCHES = 4;
const MAX_PENDING_INPUT_BYTES = 64 * 1024 * 1024;
let pendingBatches = 0;
let pendingBytes = 0;

export function sampleOtelShadow(
  projectId: string,
  fileKey: string,
  rate: number,
): boolean {
  return (
    rate > 0 &&
    (rate >= 1 ||
      getDeterministicSamplingValue(
        JSON.stringify(["otel-native-shadow", projectId, fileKey]),
      ) < rate)
  );
}

export function reserveShadowInput(input: string | Uint8Array) {
  const size =
    typeof input === "string" ? Buffer.byteLength(input) : input.byteLength;
  if (
    pendingBatches >= MAX_PENDING_BATCHES ||
    size > MAX_PENDING_INPUT_BYTES - pendingBytes
  ) {
    recordIncrement("langfuse.ingestion.otel.shadow.batch", 1, {
      outcome: "capacity",
    });
    return;
  }
  const bytes =
    typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  pendingBatches++;
  pendingBytes += size;
  let released = false;
  return {
    bytes,
    release() {
      if (released) return;
      released = true;
      pendingBatches--;
      pendingBytes -= size;
    },
  };
}
