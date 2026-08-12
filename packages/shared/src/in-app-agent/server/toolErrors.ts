/**
 * Structured tool-failure extraction for in-app-agent instrumentation.
 *
 * Only trusts explicit AG-UI `event.error` and boolean failure markers
 * (`error: true` / `isError: true`). Does not infer failure from string-valued
 * `error` fields or from message text such as "MCP error …".
 */
export function getToolFailureMessage(
  eventError: unknown,
  output: unknown,
): string | undefined {
  const explicitError = getStringValue(eventError);
  if (explicitError) {
    // Manual approval rejections encode `{code,message}` as JSON in event.error.
    // Prefer the human-readable message for statusMessage while leaving the
    // raw event.error untouched for callers that need the structured code.
    const parsed = parseJsonOrString(explicitError);
    if (isRecord(parsed)) {
      const message = getStringValue(parsed.message);
      if (message) {
        return message;
      }
    }

    return explicitError;
  }

  const normalizedOutput = normalizeToolOutput(output);
  if (!isRecord(normalizedOutput)) {
    return undefined;
  }

  if (normalizedOutput.error === true || normalizedOutput.isError === true) {
    return getStringValue(normalizedOutput.message) ?? "Tool returned an error";
  }

  return undefined;
}

export function normalizeToolOutput(output: unknown): unknown {
  const parsedOutput =
    typeof output === "string" ? parseJsonOrString(output) : output;

  if (!isRecord(parsedOutput) || !Array.isArray(parsedOutput.content)) {
    return parsedOutput;
  }

  const firstContent: unknown = parsedOutput.content[0];

  if (
    parsedOutput.content.length !== 1 ||
    !isRecord(firstContent) ||
    firstContent.type !== "text" ||
    typeof firstContent.text !== "string"
  ) {
    return parsedOutput;
  }

  return parseJsonOrString(firstContent.text);
}

export function parseJsonOrString(value: string): unknown {
  if (!value) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
