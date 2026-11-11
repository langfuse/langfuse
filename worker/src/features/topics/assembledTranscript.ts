import { stableJsonStringify, type Observation } from "@langfuse/shared";
import {
  renderTranscript,
  topicsTranscriptConfig,
  type ExecutionIssue,
  type Transcript,
} from "@langfuse/shared/src/server";
import type {
  NormalizedMessage,
  NormalizedMessagePart,
} from "@langfuse/shared/src/utils/normalized-io";

const redactInlineMedia = (text: string): string =>
  text.replace(/data:[^:;,\s]+;base64,[A-Za-z0-9+/=_-]+/g, "[media omitted]");

function modelData(value: unknown, field?: string): unknown {
  if (typeof value === "string") return redactInlineMedia(value);
  if (Array.isArray(value)) return value.map((item) => modelData(item, field));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      ["reasoning", "thinking", "redacted_thinking"].includes(
        String(record.type),
      ) ||
      record.thought === true
    )
      return "[reasoning omitted]";
    return Object.fromEntries(
      Object.entries(record)
        .filter(
          ([key]) =>
            ![
              "reasoning",
              "reasoning_content",
              "thinking",
              "signature",
              "thoughtSignature",
              "encrypted_content",
              "providerMetadata",
              "toolDefinitions",
              "tool_definitions",
            ].includes(key),
        )
        .map(([key, nested]) => [
          key,
          key === "data" &&
          (record.type === "base64" ||
            typeof record.mimeType === "string" ||
            typeof record.mime_type === "string" ||
            field === "audio" ||
            field === "input_audio")
            ? "[media omitted]"
            : modelData(nested, key),
        ]),
    );
  }
  return value;
}

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
          input: modelData(part.input),
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
              : modelData(part.output.value),
          isError: part.isError,
        },
      ];
    case "data":
      return [
        { type: part.type, name: part.name, value: modelData(part.value) },
      ];
    case "custom":
      return [
        { type: part.type, kind: part.kind, value: modelData(part.value) },
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
export const TOPICS_TEXT_VERSION = "topics-text-v2";

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
 * stand-ins carrying each execution issue; issues outside the turns' observations are placed by start time.
 */
export function renderStoredTopicText(
  transcript: Transcript,
  executionIssues: ExecutionIssue[],
): string {
  const issues = new Map(
    executionIssues.map((issue) => [issue.observationId, issue]),
  );
  const messages = transcript.threads.flatMap(
    (thread) => thread.currentTurn.messages,
  );
  const ids = [
    ...new Set(
      transcript.threads.flatMap((thread) =>
        thread.currentTurn.observations.map(({ id }) => id),
      ),
    ),
  ];
  for (const issue of executionIssues) {
    if (ids.includes(issue.observationId)) continue;
    const next = messages.find(
      (message) => message.startTime > issue.startTime,
    );
    const at = next ? ids.indexOf(next.observationId) : -1;
    ids.splice(at === -1 ? ids.length : at, 0, issue.observationId);
  }
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
