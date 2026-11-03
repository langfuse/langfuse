import type { OrderedObservation } from "./ordering";
import { assembleTranscript } from "./transcript";
import type {
  ExecutionIssue,
  TranscriptContext,
  TranscriptObservation,
  TranscriptOptions,
} from "./types";

const STATUS_MESSAGE_MAX_CHARACTERS = 1_000;

/** Check if an observation's level and status message make it an execution issue. */
export function isExecutionIssue<
  T extends Pick<TranscriptObservation, "level" | "statusMessage">,
>(observation: T): observation is T & { level: ExecutionIssue["level"] } {
  return (
    observation.level === "ERROR" ||
    (observation.level === "WARNING" && Boolean(observation.statusMessage))
  );
}

function toExecutionIssue(
  observation: OrderedObservation & { level: ExecutionIssue["level"] },
): ExecutionIssue {
  return {
    observationId: observation.id,
    traceId: observation.traceId,
    type: observation.type,
    name: observation.name ?? null,
    level: observation.level,
    statusMessage: observation.statusMessage
      ? observation.statusMessage.slice(0, STATUS_MESSAGE_MAX_CHARACTERS)
      : null,
    startTime: observation.startTime,
  };
}

/** Execution issues of all supplied observations, in the given order. */
function collectExecutionIssues(
  observations: OrderedObservation[],
): ExecutionIssue[] {
  const issues: ExecutionIssue[] = [];
  for (const observation of observations)
    if (isExecutionIssue(observation))
      issues.push(toExecutionIssue(observation));
  return issues;
}

/**
 * Assemble the transcript and collect execution issues from the same ordered
 * observations. Null when there is no transcript: issues are only reported
 * alongside a conversation. Options apply to the transcript only.
 */
export function assembleTranscriptContext(
  orderedObservations: OrderedObservation[],
  options?: TranscriptOptions,
): TranscriptContext | null {
  const transcript = assembleTranscript(orderedObservations, options);
  if (!transcript) return null;
  return {
    transcript,
    executionIssues: collectExecutionIssues(orderedObservations),
  };
}
