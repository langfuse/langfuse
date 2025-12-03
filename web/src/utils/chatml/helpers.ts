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

/**
 * used to check if a tool call is "complex" to render as PrettyJsonView table
 * or stringify it and render it as pure string. only used for role: tool type
 * calls. used for tool calls themselves, not for tool selections by an LLM.
 *
 * Rich = has nested structure OR has more than 2 top-level keys
 * Simple <= 2 keys with only scalar values (strings, numbers, booleans, null)
 */
export function isRichToolResult(content: unknown): boolean {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return false;
  }

  const keys = Object.keys(content);

  // More than 2 keys → probably rich/structured data
  if (keys.length > 2) return true;

  // Check if any value is an object or array (nested structure)
  for (const key of keys) {
    const value = (content as Record<string, unknown>)[key];
    if (value && typeof value === "object") {
      return true; // Has nested structure
    }
  }

  // 1-2 keys with only scalar values: simple
  return false;
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
