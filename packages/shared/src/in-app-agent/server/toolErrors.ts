export function getToolFailureMessage(
  eventError: unknown,
  output: unknown,
): string | undefined {
  const explicitError = getStringValue(eventError);
  if (explicitError) {
    return explicitError;
  }

  const normalizedOutput = normalizeToolOutput(output);

  if (typeof normalizedOutput === "string") {
    const message = normalizedOutput.trim();
    return /^MCP error\b/i.test(message) ? message : undefined;
  }

  if (!isRecord(normalizedOutput)) {
    return undefined;
  }

  const structuredError = getStringValue(normalizedOutput.error);
  if (structuredError) {
    return structuredError;
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

function parseJsonOrString(value: string): unknown {
  if (!value) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
