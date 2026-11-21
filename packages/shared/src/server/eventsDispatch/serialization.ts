import type { ExecutionIssue, Transcript } from "../transcript/types";
import type { StoredExecutionIssueV1, StoredTranscriptV1 } from "./versions/v1";

/**
 * Encode the live transcript as stored V1. Only message dates need conversion;
 * when this stops compiling, the live schema has diverged from V1 and the
 * change needs either a compatible V1 addition or a new version.
 */
export function toStoredTranscriptV1(value: Transcript): StoredTranscriptV1 {
  return {
    ...value,
    threads: value.threads.map((thread) => ({
      ...thread,
      currentTurn: {
        ...thread.currentTurn,
        messages: thread.currentTurn.messages.map((message) => ({
          ...message,
          startTime: message.startTime.toISOString(),
          endTime: message.endTime?.toISOString() ?? null,
        })),
      },
    })),
  };
}

/** Decode an already validated V1 payload into the current transcript representation. */
export function fromStoredTranscriptV1(value: StoredTranscriptV1): Transcript {
  return {
    ...value,
    threads: value.threads.map((thread) => ({
      ...thread,
      currentTurn: {
        ...thread.currentTurn,
        messages: thread.currentTurn.messages.map((message) => ({
          ...message,
          startTime: new Date(message.startTime),
          endTime: message.endTime === null ? null : new Date(message.endTime),
        })),
      },
    })),
  };
}

export function toStoredExecutionIssuesV1(
  issues: ExecutionIssue[],
): StoredExecutionIssueV1[] {
  return issues.map((issue) => ({
    ...issue,
    startTime: issue.startTime.toISOString(),
  }));
}

export function fromStoredExecutionIssuesV1(
  issues: StoredExecutionIssueV1[],
): ExecutionIssue[] {
  return issues.map((issue) => ({
    ...issue,
    startTime: new Date(issue.startTime),
  }));
}
