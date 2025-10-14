export function removeNullFields(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;

  const cleaned: Record<string, unknown> = { ...obj };

  Object.keys(cleaned).forEach((key) => {
    if (cleaned[key] === null) {
      delete cleaned[key];
    }
  });

  return cleaned;
}

export function stringifyToolCallArgs(toolCall: any): any {
  if (!toolCall?.function) return toolCall;

  return {
    ...toolCall,
    function: {
      ...toolCall.function,
      arguments:
        typeof toolCall.function.arguments === "string"
          ? toolCall.function.arguments
          : JSON.stringify(toolCall.function.arguments ?? {}),
    },
  };
}

export function stringifyToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  return JSON.stringify(content);
}

export function parseMetadata(metadata: unknown): Record<string, any> | null {
  if (!metadata) return null;

  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  }

  if (typeof metadata === "object") {
    return metadata as Record<string, any>;
  }

  return null;
}
