import type {
  ToolResultPart,
  ToolResultOutput,
  ToolResultContentPart,
} from "../../../types";
import {
  asRecord,
  optionalString,
  compact,
  nullableString,
  toJsonValue,
  parseIfString,
} from "../../utils/json";
import { normalizePartList } from "../part";

// Tagged output wrappers originate in the AI SDK and occur across dialects.
const OUTPUT_WRAPPER_TYPES = new Set([
  "text",
  "json",
  "content",
  "error-text",
  "error-json",
  "execution-denied",
]);

type ToolResultFields = {
  /** Raw id value; coerced via nullableString. */
  toolCallId?: unknown;
  /** Raw name value; coerced via optionalString. */
  toolName?: unknown;
  /** Raw payload; normalize only its top-level content envelope. */
  output?: unknown;
  isError?: boolean;
};

/**
 * Canonical tool-result constructor. Takes already-extracted fields — the
 * caller (a provider handler, or `toolResultPartFromLooseShape` for
 * dialect-less shapes) owns the field vocabulary; this owns only the
 * mechanics every dialect shares.
 */
export function toolResultPart(fields: ToolResultFields): ToolResultPart {
  const wrapper = asRecord(fields.output);
  const wrapperType = optionalString(wrapper?.type);
  const isWrapped =
    wrapper !== undefined &&
    wrapperType !== undefined &&
    "value" in wrapper &&
    OUTPUT_WRAPPER_TYPES.has(wrapperType);
  const wrapperError =
    isWrapped && wrapperType.startsWith("error") ? true : undefined;

  return compact<ToolResultPart>({
    type: "tool-result",
    toolCallId: nullableString(fields.toolCallId),
    toolName: optionalString(fields.toolName),
    output: normalizeToolResultOutput(fields.output),
    isError: fields.isError ?? wrapperError,
  });
}

// Only these shallow content shapes enter part dispatch. Tool calls/results and
// unknown objects remain data, so nested user JSON cannot recurse into assembly.
const CONTENT_TYPES = new Set([
  "text",
  "input_text",
  "output_text",
  "reasoning",
  "thinking",
  "redacted_thinking",
  "image",
  "image_url",
  "input_image",
  "input_audio",
  "file",
  "document",
  "container_upload",
  "reasoning-file",
  "image-data",
  "image-url",
  "file-data",
  "file-url",
]);

function normalizeContentItem(value: unknown): ToolResultContentPart[] {
  const record = asRecord(value);
  // Canonical content may be replayed through a normalized tool-result envelope.
  const content = asRecord(record?.content);
  if (
    record?.type === "file" &&
    content &&
    ((content.kind === "url" && typeof content.url === "string") ||
      (content.kind === "base64" && typeof content.data === "string") ||
      (content.kind === "reference" && typeof content.id === "string"))
  ) {
    return [value as ToolResultContentPart];
  }
  if (
    record?.type === "reasoning" &&
    content &&
    (content.kind === "text" ||
      content.kind === "data" ||
      content.kind === "redacted" ||
      content.kind === "encrypted")
  ) {
    return [value as ToolResultContentPart];
  }
  if (
    record?.type === "custom" &&
    typeof record.kind === "string" &&
    "value" in record
  ) {
    return [value as ToolResultContentPart];
  }
  if (
    typeof value === "string" ||
    (record &&
      typeof record.type === "string" &&
      CONTENT_TYPES.has(record.type))
  ) {
    const parts = normalizePartList([value]);
    if (parts.length > 0) {
      return parts.map(
        (part): ToolResultContentPart =>
          part.type === "tool-call" || part.type === "tool-result"
            ? { type: "data", value: toJsonValue(value) }
            : part,
      );
    }
  }
  if (record && record.type === "data" && "value" in record) {
    return [{ ...record, type: "data", value: toJsonValue(record.value) }];
  }
  if (record && typeof record.type === "string") {
    return [{ type: "custom", kind: record.type, value: toJsonValue(value) }];
  }
  return [{ type: "data", value: toJsonValue(value) }];
}

/** Bounded content recognition; arbitrary objects are never searched recursively. */
export function normalizeToolResultOutput(value: unknown): ToolResultOutput {
  const wrapper = asRecord(value);
  if (
    wrapper &&
    typeof wrapper.type === "string" &&
    "value" in wrapper &&
    OUTPUT_WRAPPER_TYPES.has(wrapper.type)
  ) {
    if (wrapper.type === "content" && Array.isArray(wrapper.value)) {
      return {
        type: "content",
        value: wrapper.value.flatMap(normalizeContentItem),
      };
    }
    if (
      (wrapper.type === "text" || wrapper.type === "error-text") &&
      typeof wrapper.value === "string"
    ) {
      return { type: "text", value: wrapper.value };
    }
    return { type: "json", value: toJsonValue(wrapper.value) };
  }
  const parsed = parseIfString(value ?? null);
  if (typeof parsed === "string") return { type: "text", value: parsed };
  return { type: "json", value: toJsonValue(parsed) };
}
