import type {
  JsonValue,
  ToolResultPart,
} from "@langfuse/shared/src/utils/normalized-io";

/** Projects tool content for the session code block without changing the transcript. */
export function getSessionToolOutputPreview(output: ToolResultPart["output"]): {
  value: JsonValue;
  omittedContent: Array<{ kind: "media" | "unsupported"; count: number }>;
} {
  if (output.type !== "content") {
    return { value: output.value, omittedContent: [] };
  }

  const values: JsonValue[] = [];
  let onlyText = true;
  let media = 0;
  let unsupported = 0;
  for (const part of output.value) {
    if (part.type === "text") {
      values.push(part.text);
    } else if (part.type === "data") {
      values.push(part.value);
      onlyText = false;
    } else if (part.type === "file") {
      media++;
    } else {
      unsupported++;
    }
  }

  let value: JsonValue = null;
  if (values.length > 0) {
    if (onlyText) value = values.join("\n");
    else value = values.length === 1 ? values[0]! : values;
  }
  return {
    value,
    omittedContent: [
      ...(media ? [{ kind: "media" as const, count: media }] : []),
      ...(unsupported
        ? [{ kind: "unsupported" as const, count: unsupported }]
        : []),
    ],
  };
}
