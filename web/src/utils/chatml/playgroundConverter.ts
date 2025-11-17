import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";
import {
  ChatMessageRole,
  ChatMessageType,
  isOpenAITextContentPart,
  isOpenAIImageContentPart,
  type ChatMessage,
  type PlaceholderMessage,
} from "@langfuse/shared";

// convert content to string format expected by playground
function contentToString(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (content === null || content === undefined) {
    return "";
  }

  // Handle OpenAI/Vercel AI SDK content parts array: [{type: "text", text: "..."}, ...]
  // Extract text for playground display; stringify other structures (tool results, etc.)
  if (Array.isArray(content)) {
    const textParts: string[] = [];

    for (const item of content) {
      if (isOpenAITextContentPart(item)) {
        textParts.push(item.text);
      } else if (isOpenAIImageContentPart(item)) {
        textParts.push("[Image]");
      } else if (
        item &&
        typeof item === "object" &&
        "type" in item &&
        item.type === "input_audio"
      ) {
        textParts.push("[Audio]");
      }
    }

    // If we extracted any text parts, return them joined
    if (textParts.length > 0) {
      return textParts.join("\n");
    }
  }

  return JSON.stringify(content);
}

export function convertChatMlToPlayground(
  msg: ChatMlMessageSchema,
): ChatMessage | PlaceholderMessage | null {
  // Handle placeholder messages
  if (msg.type === "placeholder") {
    return {
      type: ChatMessageType.Placeholder,
      name: msg.name || "",
    } as PlaceholderMessage;
  }

  // Handle assistant messages with tool calls (from json field)
  // Note: ChatMlSchema may nest in json.json due to content union matching
  const jsonData = msg.json?.json || msg.json;
  const toolCallsSource = msg.tool_calls || jsonData?.tool_calls;

  if (toolCallsSource && Array.isArray(toolCallsSource)) {
    const toolCalls = toolCallsSource.map((tc: any) => {
      let args: Record<string, unknown>;
      let name: string;

      // Handle flat format: {id, name, arguments, type}
      if (tc.name && !tc.function) {
        name = tc.name;
        try {
          args =
            typeof tc.arguments === "string"
              ? JSON.parse(tc.arguments)
              : (tc.arguments ?? {});
        } catch {
          args = {};
        }
      }
      // Handle nested format: {id, type, function: {name, arguments}}
      else {
        name = tc.function?.name || "";
        try {
          args =
            typeof tc.function?.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : (tc.function?.arguments ?? {});
        } catch {
          args = {};
        }
      }

      return {
        id: tc.id || "",
        name,
        args,
      };
    });

    return {
      role: ChatMessageRole.Assistant,
      content: contentToString(msg.content),
      type: ChatMessageType.AssistantToolCall,
      toolCalls,
    };
  }

  // Handle tool results
  // Check top-level field first, then fall back to json field
  const toolCallId =
    msg.tool_call_id || jsonData?.tool_call_id || jsonData?.toolCallId;
  if (toolCallId) {
    // If content is undefined but we have rich data in json.json (spread tool result),
    // use that for playground display
    // this happens if for complex tool calls isRichToolResult applies
    const toolContent =
      msg.content !== undefined && msg.content !== null
        ? msg.content
        : jsonData;

    return {
      role: ChatMessageRole.Tool,
      content: contentToString(toolContent),
      type: ChatMessageType.ToolResult,
      toolCallId: toolCallId as string,
    };
  }

  // Handle regular messages
  return {
    role: (msg.role as ChatMessageRole) || ChatMessageRole.Assistant,
    content: contentToString(msg.content),
    type: ChatMessageType.PublicAPICreated,
  };
}
