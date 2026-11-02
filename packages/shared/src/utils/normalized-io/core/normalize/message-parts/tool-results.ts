import type {
  NormalizedMessagePart,
  ToolResultContentPart,
  ToolResultOutput,
} from "../../../types";
import { toJsonValue } from "../../utils/json";

/** Package normalized parts without interpreting or normalizing their contents. */
export function toolResultOutput(
  parts: NormalizedMessagePart[],
  fallback: unknown,
): ToolResultOutput {
  if (
    parts.length === 0 ||
    !parts.every(
      (part): part is ToolResultContentPart =>
        part.type !== "tool-call" && part.type !== "tool-result",
    )
  ) {
    return { type: "json", value: toJsonValue(fallback) };
  }

  const [part] = parts;
  // Only unwrap bare scalar parts; annotations and metadata stay on the part.
  if (parts.length === 1) {
    if (
      part.type === "text" &&
      Object.keys(part).every((key) => key === "type" || key === "text")
    ) {
      return { type: "text", value: part.text };
    }
    if (
      part.type === "data" &&
      Object.keys(part).every((key) => key === "type" || key === "value")
    ) {
      return { type: "json", value: part.value };
    }
  }
  return { type: "content", value: parts };
}
