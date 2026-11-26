import type { FinalizedOtelEvent } from "@langfuse/native";
import {
  linkMediaToTraceOrObservation,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";
import { ClickhouseWriter, TableName } from "../../services/ClickhouseWriter";
import {
  productionEvalWrites,
  type EvalWrites,
} from "../evaluation/scheduleEvals";
import type { MediaWrites } from "../otel-media/resolveExtractedMedia";

/**
 * Every durable write of the Rust OTEL path: media, evaluation scheduling,
 * trace activity and the event row. The caller decides where they go.
 */
export type RustOtelWrites = MediaWrites & {
  /** Called once per batch, and only when a rule needs scheduling. */
  evalWrites: () => EvalWrites;
  writeEvent: (event: FinalizedOtelEvent) => void;
};

export const productionRustOtelWrites = (): RustOtelWrites => ({
  uploadMedia: uploadMediaForTrace,
  linkMedia: linkMediaToTraceOrObservation,
  evalWrites: productionEvalWrites,
  writeEvent: ({ event }) =>
    ClickhouseWriter.getNativeInstance().addToQueue(
      TableName.EventsFull,
      event,
    ),
});
