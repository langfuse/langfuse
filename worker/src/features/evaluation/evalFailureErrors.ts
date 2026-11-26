import { UnrecoverableError } from "../../errors/UnrecoverableError";

/**
 * Bounded reasons for known evaluation failure sites. Values are emitted as
 * metric tag values, so keep the set small and never derive them from input.
 */
export const EvalFailureReason = {
  InvalidModelConfig: "invalid_model_config",
  InvalidModelOutput: "invalid_model_output",
  ObservationDownload: "observation_download",
  InvalidObservationData: "invalid_observation_data",
  ScorePersistence: "score_persistence",
} as const;

export type EvalFailureReason =
  (typeof EvalFailureReason)[keyof typeof EvalFailureReason];

/** Retryable evaluation failure; BullMQ retries it like any other error. */
export class EvalFailureError extends Error {
  constructor(
    message: string,
    readonly reason: EvalFailureReason,
  ) {
    super(message);
    this.name = "EvalFailureError";
  }
}

/**
 * Terminal evaluation failure. Keeps the `UnrecoverableError` name so existing
 * `isUnrecoverableError` checks continue to stop retries.
 */
export class UnrecoverableEvalFailureError extends UnrecoverableError {
  constructor(
    message: string,
    readonly reason: EvalFailureReason,
  ) {
    super(message);
  }
}

export function getEvalFailureReason(error: unknown): EvalFailureReason | null {
  return error instanceof EvalFailureError ||
    error instanceof UnrecoverableEvalFailureError
    ? error.reason
    : null;
}
