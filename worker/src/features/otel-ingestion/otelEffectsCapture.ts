import { createHash } from "crypto";
import {
  MediaAssociationOrigin,
  stableJsonStringify,
  type EvalExecutionMode,
  type EvalTemplateType,
  type MediaContentType,
  type MediaField,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import type {
  EventRecordInsertType,
  OtelMediaWritePath,
} from "@langfuse/shared/src/server";
import type { EvalRules } from "../evaluation/fetchEvalRules";
import type { EvalSchedulerDeps } from "../evaluation/scheduleEvals";

/**
 * The primary-side effect DTOs needed by the OTEL shadow comparator. The
 * scheduling-context entry is intentionally an in-memory handoff because it
 * carries the already-prepared rule promise; intent entries remain payload
 * free and JSON-safe.
 *
 * The callbacks are deliberately optional. The normal ingestion path passes no
 * capture object, so it does not allocate effect records or retain source
 * rows. The collector is an internal synchronous sink and must not throw.
 */
export type OtelShadowCapture = {
  /** Canonical sink shared by the TypeScript and Rust primary/shadow paths. */
  capture: (effect: OtelEffect) => void;
  /** Capture bookkeeping must not be allowed to affect ingestion. */
  onCaptureFailure?: (error: unknown) => void;
  /** Called after the production writer accepts a row into its buffer. */
  onEventWriteQueued?: (row: Readonly<EventRecordInsertType>) => void;
  /** Called by the writer's per-row terminal callback. */
  onEventWriteTerminal?: (outcome: OtelEventWriteTerminalOutcome) => void;
};

export type OtelCaptureMode = "actual" | "simulated";

export type OtelCaptureFailureStage = "observation-hash" | "capture-hook";

export type OtelOperation =
  | "observation-normalization"
  | "eval-upsert"
  | "eval-blob-upload"
  | "eval-enqueue"
  | "direct-row-create"
  | "direct-row-write"
  | "native-lookup"
  | "native-media-upload"
  | "native-overflow-upload";

export type OtelMediaUploadEffect = {
  kind: "media";
  projectId: string;
  traceId: string;
  observationId?: string;
  field: MediaField;
  contentType: MediaContentType | string;
  sha256Hash: string;
  origin: MediaAssociationOrigin;
  writePath: OtelMediaWritePath;
  mediaPath?: "early" | "reference";
  request: {
    byteLengthUpperBound?: number;
  };
  result:
    | {
        mediaId: string;
        outcome: "uploaded" | "reused";
        byteLength?: number;
        /** True when the batch-local extracted-media cache supplied the link. */
        cacheHit?: boolean;
        bytesRemoved?: number;
      }
    | {
        outcome: "failed";
        error: { type: string };
      };
};

export type OtelEffect =
  | OtelMediaUploadEffect
  | OtelEvalUpsertEffect
  | OtelEvalBlobUploadEffect
  | OtelObservationEvalEffect
  | OtelTraceRecordingEffect
  | OtelCaptureFailureEffect
  | OtelOperationFailureEffect
  | OtelSchedulingContextEffect;

/** One successful job-execution upsert before the eval queue attempt. */
export type OtelEvalUpsertEffect = {
  kind: "eval-upsert";
  projectId: string;
  jobExecutionId: string;
  jobConfigurationId: string;
};

/** One successful observation blob upload before the eval queue attempt. */
export type OtelEvalBlobUploadEffect = {
  kind: "eval-blob-upload";
  projectId: string;
  traceId: string;
  observationId: string;
  observationHash: string;
};

/** One observation-eval enqueue decision after rule matching and sampling. */
export type OtelObservationEvalEffect = {
  kind: "observation-eval";
  projectId: string;
  traceId: string;
  observationId: string;
  jobExecutionId: string;
  jobConfigurationId: string;
  jobTemplateId: string | null;
  jobInputTraceId: string;
  jobInputObservationId: string;
  /** Digest of the normalized observation, avoiding retained payload copies. */
  observationHash: string;
  request: {
    projectId: string;
    observationS3Path: string;
    delay: number;
    evalTemplateType: EvalTemplateType;
    executionMode?: EvalExecutionMode;
    evaluatorId?: string;
    evaluationRuleId?: string;
    variableMapping?: ObservationVariableMapping[];
    batchActionId?: string;
  };
};

/** One trace-recording intent after the corresponding event row was accepted. */
type OtelTraceRecordingEffect = {
  kind: "trace-recording";
  projectId: string;
  traceId: string;
  spanStartTimeISO: string;
  ruleIds: readonly string[];
  serializedEventBytes: number;
};

/** A capture-only failure; the parent must mark the comparison inconclusive. */
type OtelCaptureFailureEffect = {
  kind: "capture-failure";
  stage: OtelCaptureFailureStage;
  mode: OtelCaptureMode;
  error: { type: string };
};

/** An actual or simulated operation that failed before producing its intent. */
export type OtelOperationFailureEffect = {
  kind: "operation-failure";
  operation: OtelOperation;
  mode: OtelCaptureMode;
  projectId: string;
  traceId?: string;
  observationId?: string;
  error: { type: string };
};

/**
 * The primary's already-resolved scheduler inputs. The transcript-rule
 * promise is intentionally captured without awaiting it; the parent shadow
 * collector can await the same prepared promise without delaying ingestion.
 */
export type OtelSchedulingContextEffect = {
  kind: "scheduling-context";
  projectId: string;
  traceDispatchSamplingRate: number;
  evalRules: EvalRules;
  traceTranscriptRules: EvalSchedulerDeps["traceTranscriptRules"];
};

export type OtelEventWriteTerminalOutcome =
  | {
      status: "inserted";
      row: Readonly<EventRecordInsertType>;
    }
  | {
      status: "dropped";
      row: Readonly<EventRecordInsertType>;
      error: unknown;
    };

export function emitOtelEventWriteQueued(
  shadowCapture: OtelShadowCapture | undefined,
  row: Readonly<EventRecordInsertType>,
): void {
  try {
    shadowCapture?.onEventWriteQueued?.(row);
  } catch (error) {
    reportCaptureHookFailure(shadowCapture, error);
  }
}

export function emitOtelEventWriteTerminal(
  shadowCapture: OtelShadowCapture | undefined,
  outcome: OtelEventWriteTerminalOutcome,
): void {
  try {
    shadowCapture?.onEventWriteTerminal?.(outcome);
  } catch (error) {
    reportCaptureHookFailure(shadowCapture, error);
  }
}

export function getOtelCaptureErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  return typeof error === "object" && error !== null ? "object" : typeof error;
}

/**
 * Hash the normalized eval payload without retaining it in the effect stream.
 * Object keys are sorted recursively; array order and scalar values are kept.
 */
export function hashOtelObservation(observation: unknown): string {
  return createHash("sha256")
    .update(stableJsonStringify(observation), "utf8")
    .digest("base64");
}

export function emitOtelEffect(
  shadowCapture: OtelShadowCapture | undefined,
  effect: OtelEffect,
): void {
  try {
    shadowCapture?.capture?.(effect);
  } catch (error) {
    reportCaptureHookFailure(shadowCapture, error);
  }
}

export function emitOtelCaptureFailure(
  shadowCapture: OtelShadowCapture | undefined,
  stage: OtelCaptureFailureStage,
  mode: OtelCaptureMode,
  error: unknown,
): void {
  emitOtelEffect(shadowCapture, {
    kind: "capture-failure",
    stage,
    mode,
    error: { type: getOtelCaptureErrorType(error) },
  });
}

export function emitOtelOperationFailure(
  shadowCapture: OtelShadowCapture | undefined,
  params: {
    operation: OtelOperation;
    mode: OtelCaptureMode;
    projectId: string;
    traceId?: string;
    observationId?: string;
    error: unknown;
  },
): void {
  emitOtelEffect(shadowCapture, {
    kind: "operation-failure",
    operation: params.operation,
    mode: params.mode,
    projectId: params.projectId,
    ...(params.traceId ? { traceId: params.traceId } : {}),
    ...(params.observationId ? { observationId: params.observationId } : {}),
    error: { type: getOtelCaptureErrorType(params.error) },
  });
}

function reportCaptureHookFailure(
  shadowCapture: OtelShadowCapture | undefined,
  error: unknown,
): void {
  try {
    shadowCapture?.onCaptureFailure?.(error);
  } catch {
    // Capture is best-effort; a broken failure hook must not escape either.
  }
}
