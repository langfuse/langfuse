import type { ToolResultPart } from "../../../types";
import {
  asRecord,
  optionalString,
  compact,
  nullableString,
  toJsonValue,
  parseIfString,
} from "../../utils/json";

// {type, value} output wrappers originate in the AI SDK but echo through
// loose conversions of every dialect, so unwrapping them is canonical
// builder mechanics — the one deliberate residual in this file. error-*
// marks a failed execution.
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
  /** Raw payload; the builder unwraps output wrappers, parses one
   * JSON-string boundary, and converts to JsonValue. */
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
    output: toJsonValue(
      parseIfString(isWrapped ? wrapper.value : (fields.output ?? null)),
    ),
    isError: fields.isError ?? wrapperError,
  });
}
