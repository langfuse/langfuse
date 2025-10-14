import type { ChatMlMessageSchema } from "@/src/components/schemas/ChatMlSchema";
import {
  ChatMessageRole,
  ChatMessageType,
  type ChatMessage,
  type PlaceholderMessage,
} from "@langfuse/shared";

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
  if (jsonData?.tool_calls && Array.isArray(jsonData.tool_calls)) {
    const toolCalls = jsonData.tool_calls.map((tc: any) => {
      let args: Record<string, unknown>;
      try {
        args =
          typeof tc.function?.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : (tc.function?.arguments ?? {});
      } catch {
        args = {};
      }

      return {
        id: tc.id || "",
        name: tc.function?.name || "",
        args,
      };
    });

    return {
      role: ChatMessageRole.Assistant,
      content: (msg.content as string) || "",
      type: ChatMessageType.AssistantToolCall,
      toolCalls,
    };
  }

  // Handle tool results (from json field)
  if (jsonData?.tool_call_id || jsonData?.toolCallId) {
    return {
      role: ChatMessageRole.Tool,
      content: (msg.content as string) || "",
      type: ChatMessageType.ToolResult,
      toolCallId: (jsonData.tool_call_id || jsonData.toolCallId) as string,
    };
  }

  // Handle regular messages
  const content =
    typeof msg.content === "string"
      ? msg.content
      : msg.content === null || msg.content === undefined
        ? ""
        : JSON.stringify(msg.content);

  return {
    role: (msg.role as ChatMessageRole) || ChatMessageRole.Assistant,
    content,
    type: ChatMessageType.PublicAPICreated,
  };
}
