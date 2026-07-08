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

function parseIfString(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseArrayIfString(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  const parsed = parseIfString(value);
  return Array.isArray(parsed) ? parsed : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize available tool definitions from provider-specific shapes to ChatML.
 * Built-in provider tools often have no `name`, so we fall back to `id`/`type`
 * for display while backend column extraction can still ignore unnamed tools.
 */
export function normalizeToolDefinitionForChatMl(
  tool: unknown,
): Record<string, unknown> | null {
  const parsedTool = parseIfString(tool);
  if (!isPlainRecord(parsedTool)) return null;

  const nestedFunction = isPlainRecord(parsedTool.function)
    ? parsedTool.function
    : undefined;
  const source = nestedFunction ?? parsedTool;

  const rawName =
    source.name ??
    parsedTool.name ??
    parsedTool.id ??
    (parsedTool.type !== "function" ? parsedTool.type : undefined);

  if (typeof rawName !== "string" || rawName.length === 0) return null;

  const rawDescription = source.description ?? parsedTool.description;
  const rawParameters =
    source.parameters ??
    source.parameters_json_schema ??
    source.inputSchema ??
    parsedTool.parameters ??
    parsedTool.parameters_json_schema ??
    parsedTool.inputSchema;

  const normalized: Record<string, unknown> = {
    name: rawName,
    description: typeof rawDescription === "string" ? rawDescription : "",
  };

  if (isPlainRecord(rawParameters)) {
    normalized.parameters = rawParameters;
  }

  return normalized;
}

export function normalizeToolDefinitionsForChatMl(
  tools: unknown,
): Array<Record<string, unknown>> {
  const parsedTools = parseArrayIfString(tools);
  if (!parsedTools) return [];

  return parsedTools
    .map(normalizeToolDefinitionForChatMl)
    .filter((tool): tool is Record<string, unknown> => tool !== null);
}

function dedupeToolDefinitionsForChatMl(
  tools: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const seenNames = new Set<string>();
  return tools.filter((tool) => {
    const name = tool.name;
    if (typeof name !== "string" || name.length === 0) return false;
    if (seenNames.has(name)) return false;
    seenNames.add(name);
    return true;
  });
}

export function attachToolDefinitionsToMessages(
  messages: unknown[],
  tools: Array<Record<string, unknown>>,
): unknown[] {
  const dedupedTools = dedupeToolDefinitionsForChatMl(tools);
  if (dedupedTools.length === 0) return messages;

  return messages.map((msg) => ({
    ...(isPlainRecord(msg) ? msg : {}),
    tools: dedupedTools,
  }));
}
