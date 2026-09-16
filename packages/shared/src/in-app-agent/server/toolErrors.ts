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

  // The MCP `isError` marker lives on the envelope, which normalizeToolOutput
  // discards when it unwraps a single text item. Check both, or a conventional
  // failure whose text is not JSON reads as a success.
  const parsedOutput =
    typeof output === "string" ? parseJsonOrString(output) : output;
  const normalizedOutput = normalizeToolOutput(parsedOutput);

  if (!hasFailureMarker(normalizedOutput) && !hasFailureMarker(parsedOutput)) {
    return undefined;
  }

  // Prefer the unwrapped text, then either envelope's own message.
  return (
    getStringValue(normalizedOutput) ??
    getMessageValue(normalizedOutput) ??
    getMessageValue(parsedOutput) ??
    "Tool returned an error"
  );
}

function hasFailureMarker(value: unknown): boolean {
  return isRecord(value) && (value.error === true || value.isError === true);
}

function getMessageValue(value: unknown): string | undefined {
  return isRecord(value) ? getStringValue(value.message) : undefined;
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
