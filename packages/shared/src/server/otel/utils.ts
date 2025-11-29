export function isValidDateString(dateString: string): boolean {
  return !isNaN(new Date(dateString).getTime());
}

/**
 * OTEL GenAI Semantic Convention Part Types
 * https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-input-messages.json
 */
interface OtelTextPart {
  type: "text";
  content: string;
}

interface OtelToolCallRequestPart {
  type: "tool_call";
  id?: string | null;
  name: string;
  arguments?: unknown;
}

interface OtelToolCallResponsePart {
  type: "tool_call_response";
  id?: string | null;
  response: unknown;
}

interface OtelReasoningPart {
  type: "reasoning";
  content: string;
}

interface OtelBlobPart {
  type: "blob";
  mime_type?: string | null;
  modality: "image" | "video" | "audio" | string;
  content: string; // base64
}

interface OtelUriPart {
  type: "uri";
  mime_type?: string | null;
  modality: "image" | "video" | "audio" | string;
  uri: string;
}

interface OtelFilePart {
  type: "file";
  mime_type?: string | null;
  modality: "image" | "video" | "audio" | string;
  file_id: string;
}

interface OtelGenericPart {
  type: string;
  [key: string]: unknown;
}

type OtelPart =
  | OtelTextPart
  | OtelToolCallRequestPart
  | OtelToolCallResponsePart
  | OtelReasoningPart
  | OtelBlobPart
  | OtelUriPart
  | OtelFilePart
  | OtelGenericPart;

interface OtelChatMessage {
  role: string;
  parts: OtelPart[];
  name?: string | null;
  [key: string]: unknown;
}

interface ChatMlToolCall {
  id?: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatMlMessage {
  role: string;
  name?: string;
  content?: string | ChatMlContentPart[] | null;
  tool_calls?: ChatMlToolCall[];
  tool_call_id?: string;
  [key: string]: unknown;
}

interface ChatMlContentPart {
  type: string;
  [key: string]: unknown;
}

/**
 * Converts a single OTEL part to ChatML content part format.
 */
function convertPartToContentPart(part: OtelPart): ChatMlContentPart | null {
  switch (part.type) {
    case "text": {
      const textPart = part as OtelTextPart;
      return { type: "text", text: textPart.content };
    }
    case "reasoning": {
      const reasoningPart = part as OtelReasoningPart;
      return { type: "reasoning", content: reasoningPart.content };
    }
    case "blob": {
      const blobPart = part as OtelBlobPart;
      return {
        type: "image_url",
        image_url: {
          url: `data:${blobPart.mime_type ?? "application/octet-stream"};base64,${blobPart.content}`,
        },
      };
    }
    case "uri": {
      const uriPart = part as OtelUriPart;
      if (
        uriPart.modality === "image" ||
        (typeof uriPart.mime_type === "string" &&
          uriPart.mime_type.startsWith("image/")) ||
        /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(uriPart.uri)
      ) {
        return {
          type: "image_url",
          image_url: { url: uriPart.uri },
        };
      }
      return { type: "uri", uri: uriPart.uri, mime_type: uriPart.mime_type };
    }
    case "file": {
      const filePart = part as OtelFilePart;
      return {
        type: "file",
        file_id: filePart.file_id,
        mime_type: filePart.mime_type,
      };
    }
    case "tool_call":
    case "tool_call_response":
      return null;
    default:
      return { ...part };
  }
}

/**
 * Converts an OTEL ChatMessage to ChatML format.
 * Handles:
 * - Text parts → content string or content array
 * - Tool call parts → tool_calls array
 * - Tool call response parts → tool role message
 * - Media parts (blob, uri, file) → content array with appropriate format
 */
function convertOtelMessageToChatMl(message: OtelChatMessage): ChatMlMessage {
  const { role, parts, name, ...rest } = message;

  const result: ChatMlMessage = {
    role: role === "model" ? "assistant" : role,
    ...rest,
  };

  if (name) {
    result.name = name;
  }

  const toolCalls: ChatMlToolCall[] = [];
  const contentParts: ChatMlContentPart[] = [];
  let toolCallResponseId: string | undefined;
  let toolCallResponseContent: unknown;

  for (const part of parts) {
    if (part.type === "tool_call") {
      const toolCallPart = part as OtelToolCallRequestPart;
      const toolCall: ChatMlToolCall = {
        type: "function",
        function: {
          name: toolCallPart.name,
          arguments:
            typeof toolCallPart.arguments === "string"
              ? toolCallPart.arguments
              : JSON.stringify(toolCallPart.arguments ?? {}),
        },
      };
      if (toolCallPart.id) {
        toolCall.id = toolCallPart.id;
      }
      toolCalls.push(toolCall);
    } else if (part.type === "tool_call_response") {
      const toolCallResponsePart = part as OtelToolCallResponsePart;
      toolCallResponseId = toolCallResponsePart.id ?? undefined;
      toolCallResponseContent = toolCallResponsePart.response;
    } else {
      const contentPart = convertPartToContentPart(part);
      if (contentPart) {
        contentParts.push(contentPart);
      }
    }
  }

  if (toolCallResponseId !== undefined || toolCallResponseContent) {
    if (toolCallResponseId) {
      result.tool_call_id = toolCallResponseId;
    }
    result.content =
      typeof toolCallResponseContent === "string"
        ? toolCallResponseContent
        : JSON.stringify(toolCallResponseContent);
  } else if (contentParts.length === 0) {
    result.content = null;
  } else if (
    contentParts.length === 1 &&
    contentParts[0].type === "text" &&
    "text" in contentParts[0]
  ) {
    result.content = contentParts[0].text as string;
  } else {
    result.content = contentParts;
  }

  if (toolCalls.length > 0) {
    result.tool_calls = toolCalls;
  }

  return result;
}

/**
 * Parses OTEL gen_ai.input.messages or gen_ai.output.messages attribute.
 * Converts from OTEL GenAI semantic convention format to OpenAI-like ChatML format
 * for proper rendering in the Langfuse UI.
 *
 * OTEL format: Array of {role, parts: [{type, ...}], name?}
 * ChatML format: Array of {role, content, tool_calls?, tool_call_id?, name?}
 *
 * @param value - The raw attribute value (string or already parsed)
 * @returns Parsed and converted messages array, or original value if parsing fails
 */
export function parseOtelGenAiMessages(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  let parsed: unknown;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return value;
    }
  } else {
    parsed = value;
  }

  if (!Array.isArray(parsed)) {
    return parsed;
  }

  const isOtelFormat = parsed.some(
    (msg) =>
      msg &&
      typeof msg === "object" &&
      "parts" in msg &&
      Array.isArray(msg.parts),
  );

  if (!isOtelFormat) {
    return parsed;
  }

  try {
    return parsed.map((msg) => {
      if (
        msg &&
        typeof msg === "object" &&
        "parts" in msg &&
        Array.isArray(msg.parts)
      ) {
        return convertOtelMessageToChatMl(msg as OtelChatMessage);
      }
      return msg;
    });
  } catch {
    return parsed;
  }
}

/**
 * Flattens a nested JSON object into path-based names and string values.
 * For example: {foo: {bar: "baz", num: 42}} becomes:
 * - names: ["foo.bar", "foo.num"]
 * - values: ["baz", "42"]
 *
 * All values are converted to strings for consistent storage.
 */
export function flattenJsonToPathArrays(
  obj: Record<string, unknown>,
  prefix: string = "",
): { names: string[]; values: Array<string | null | undefined> } {
  const names: string[] = [];
  const values: Array<string | null | undefined> = [];

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (
      value !== null &&
      value !== undefined &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      // Recursively flatten nested objects
      const nested = flattenJsonToPathArrays(
        value as Record<string, unknown>,
        path,
      );
      names.push(...nested.names);
      values.push(...nested.values);
    } else {
      // Leaf value - convert to string
      names.push(path);
      if (value === null || value === undefined || typeof value === "string") {
        values.push(value);
      } else {
        values.push(JSON.stringify(value));
      }
    }
  }

  return { names, values };
}
