import type {
  NormalizedMessage,
  NormalizedMessagePart,
} from "../../utils/normalized-io";

/** Identify selected message parts independently of provider annotations and provenance. */
export function messageKey(message: NormalizedMessage): string {
  return canonicalJson([message.role, message.parts.map(comparablePart)]);
}

function comparablePart(part: NormalizedMessagePart): Record<string, unknown> {
  switch (part.type) {
    case "text":
      return { type: part.type, text: part.text, refusal: part.refusal };
    case "tool-call":
      return {
        type: part.type,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
        invalid: part.invalid,
      };
    case "tool-result":
      return {
        type: part.type,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        output: {
          type: part.output.type,
          value:
            part.output.type === "content"
              ? part.output.value.map(comparablePart)
              : part.output.value,
        },
        isError: part.isError,
      };
    case "file":
      return {
        type: part.type,
        content: part.content,
        mediaType: part.mediaType,
        filename: part.filename,
      };
    case "data":
      return { type: part.type, name: part.name, value: part.value };
    case "custom":
      return { type: part.type, kind: part.kind, value: part.value };
    case "reasoning":
      return { type: part.type, content: part.content };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, value: unknown) =>
    isRecord(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
}
