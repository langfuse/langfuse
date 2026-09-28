import { createHash } from "node:crypto";
import { stableJsonStringify } from "@langfuse/shared";
import type { Transcript } from "@langfuse/shared/src/server";
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
          output: modelData(part.output),
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
  inputHash: string;
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
    inputHash: createHash("sha256").update(text).digest("hex"),
    hasContent,
  };
}
