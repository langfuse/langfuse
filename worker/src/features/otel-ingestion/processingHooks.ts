import type { OtelMediaWrite } from "../otel-media/uploadHooks";
import type { ObservationEvalSchedulerDeps } from "../evaluation/observationEval/types";
import type { recordTraceActivity } from "../traceDispatch/traceRuleRecording";

export type OtelSchedulingHooks = {
  observationWrites: (
    real: ObservationEvalSchedulerDeps,
  ) => ObservationEvalSchedulerDeps;
  recordTraceActivity: typeof recordTraceActivity;
};

type OtelRowKey = {
  traceId: string;
  spanId: string;
  startTime: string;
};

/** Temporary OTEL shadow replay target; all non-primary writes are explicit and fail-closed. */
export type OtelWriteTarget =
  | "primary"
  | {
      media: OtelMediaWrite;
      scheduling: OtelSchedulingHooks;
      onFailure?: (stage: string) => void;
      onRowEnqueued?: (row: OtelRowKey) => void;
      recordIngestionMetrics?: boolean;
    };

export function processingHooksFor(target: OtelWriteTarget) {
  return target === "primary" ? undefined : target;
}
