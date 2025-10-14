export function removeNullFields(obj: unknown): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return {};

  const cleaned: Record<string, unknown> = { ...obj };

  Object.keys(cleaned).forEach((key) => {
    if (cleaned[key] === null) {
      delete cleaned[key];
    }
  });

  return cleaned;
}

export function stringifyToolCallArgs(
  toolCall: Record<string, unknown>,
): Record<string, unknown> {
  if (!toolCall?.function) return toolCall;

  const func = toolCall.function as Record<string, unknown>;
  return {
    ...toolCall,
    function: {
      ...func,
      arguments:
        typeof func.arguments === "string"
          ? func.arguments
          : JSON.stringify(func.arguments ?? {}),
    },
  };
}

export function stringifyToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  return JSON.stringify(content);
}

export function parseMetadata(
  metadata: unknown,
): Record<string, unknown> | null {
  if (!metadata) return null;

  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  }

  if (typeof metadata === "object") {
    return metadata as Record<string, unknown>;
  }

  return null;
}

export function getNestedProperty(
  obj: Record<string, unknown> | null | undefined,
  ...path: string[]
): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
