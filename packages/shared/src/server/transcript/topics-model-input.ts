import type { Observation } from "../../domain/observations";
import { stableJsonStringify } from "../../utils/json";
import type {
  NormalizedMessage,
  NormalizedMessagePart,
} from "../../utils/normalized-io";
import { redactModelPayload, renderTranscript } from "./topics-renderer";
import { topicsTranscriptConfig } from "./topics-renderer-config";
import type { ExecutionIssue, Transcript } from "./types";

const redactInlineMedia = (text: string): string =>
  text.replace(/data:[^:;,\s]+;base64,[A-Za-z0-9+/=_-]+/g, "[media omitted]");

function modelPart(part: NormalizedMessagePart): unknown[] {
  switch (part.type) {
    case "reasoning":
      return [];
    case "file":
      if (part.reasoning) return [];
      return [
        {
          type: "file",
          mediaType: part.mediaType,
          content: "[media omitted]",
          transcript:
            typeof part.providerMetadata?.transcript === "string"
              ? redactInlineMedia(part.providerMetadata.transcript)
              : undefined,
        },
      ];
    case "text":
      return [{ type: part.type, text: redactInlineMedia(part.text) }];
    case "tool-call":
      return [
        {
          type: part.type,
          toolName: part.toolName,
          input: redactModelPayload(part.input),
          invalid: part.invalid,
        },
      ];
    case "tool-result":
      return [
        {
          type: part.type,
          toolName: part.toolName,
          output:
            part.output.type === "content"
              ? part.output.value.flatMap(modelPart)
              : redactModelPayload(part.output.value),
          isError: part.isError,
        },
      ];
    case "data":
      return [
        {
          type: part.type,
          name: part.name,
          value: redactModelPayload(part.value),
        },
      ];
    case "custom":
      return [
        {
          type: part.type,
          kind: part.kind,
          value: redactModelPayload(part.value),
        },
      ];
  }
}

/** Project the shared transcript into model evidence without retaining provenance. */
export function prepareAssembledTopicTranscript(
  transcript: Transcript | null,
): {
  text: string;
  hasContent: boolean;
} {
  let hasContent = false;
  const messages = (items: NormalizedMessage[]) =>
    items.flatMap((message) => {
      const parts = message.parts.flatMap(modelPart);
      if (!parts.length) return [];
      hasContent = true;
      return [{ role: message.role, parts }];
    });
  const text = stableJsonStringify({
    threads: (transcript?.threads ?? []).map((thread) => ({
      conversationHistory: messages(thread.conversationHistory),
      currentTurn: messages(thread.currentTurn.messages),
    })),
  });
  return {
    text,
    hasContent,
  };
}

// Bump when the Topics text rendering changes what the summarizer sees.
export const TOPICS_TEXT_VERSION = "topics-text-v3";

// No per-block caps; only the summary input limit bounds the text.
const UNCAPPED = Number.MAX_SAFE_INTEGER;
const UNCAPPED_TOPICS_CONFIG = {
  ...topicsTranscriptConfig,
  ...Object.fromEntries(
    Object.entries(topicsTranscriptConfig).flatMap(([key, value]) =>
      typeof value === "object" && value !== null && "maxChars" in value
        ? [[key, { ...value, maxChars: UNCAPPED }]]
        : [],
    ),
  ),
  // Stand-ins have no names, so operation lines would carry no information.
  observations: { include: false },
  // Collapsed whitespace makes code in tool results look broken.
  collapseWhitespace: false,
};

/**
 * Renders a stored transcript as Topics text. Stored inputs have no observations, so the renderer gets
 * stand-ins carrying each execution issue; issues outside the turns' observations are placed by start time,
 * except issues of a wrapping root span, which describe the whole run and go at its end. With several traces,
 * root issues go after the last message.
 */
export function renderStoredTopicText(
  transcript: Transcript,
  executionIssues: ExecutionIssue[],
): string {
  const issues = new Map(
    executionIssues.map((issue) => [issue.observationId, issue]),
  );
  // Across threads by time, so an issue lands at its moment, not in an earlier-listed thread.
  const messages = transcript.threads
    .flatMap((thread) => thread.currentTurn.messages)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const ids = [
    ...new Set(
      transcript.threads.flatMap((thread) =>
        thread.currentTurn.observations.map(({ id }) => id),
      ),
    ),
  ];
  const roots: string[] = [];
  for (const issue of executionIssues) {
    if (ids.includes(issue.observationId)) continue;
    // A wrapping root span starts before the run it wraps, so its start time would put a run-level error first.
    // A top-level observation that starts after its trace's first message is a mid-run step and keeps its time.
    // An issue without a trace ID matches no message and counts as run-level.
    const first = messages.find((message) => message.traceId === issue.traceId);
    if (
      issue.parentObservationId === null &&
      (!first || issue.startTime <= first.startTime)
    ) {
      roots.push(issue.observationId);
      continue;
    }
    const next = messages.find(
      (message) => message.startTime > issue.startTime,
    );
    const at = next ? ids.indexOf(next.observationId) : -1;
    ids.splice(at === -1 ? ids.length : at, 0, issue.observationId);
  }
  // Run-level failures come last, after time-placed issues that have no later message.
  ids.push(...roots);
  // Renderer reads id, type, name, level, statusMessage, parentObservationId, input and metadata.
  const observations = ids.map((id) => {
    const issue = issues.get(id);
    return {
      id,
      type: issue?.type ?? "SPAN",
      name: issue?.name ?? null,
      level: issue?.level ?? "DEFAULT",
      statusMessage: issue?.statusMessage ?? null,
      parentObservationId: null,
      input: null,
      output: null,
      metadata: {},
    } as unknown as Observation;
  });
  return renderTranscript(transcript, observations, UNCAPPED_TOPICS_CONFIG)
    .text;
}
