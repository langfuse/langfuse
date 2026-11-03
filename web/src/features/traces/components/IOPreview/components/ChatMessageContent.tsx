import { ToolCallInvocationsView } from "@/src/features/traces/components/ToolCallInvocationsView";
import {
  hasThinkingContent,
  hasRedactedThinkingContent,
} from "../../../fns/chatMessageUtils";
import { ThinkingBlock } from "../../ThinkingBlock";
import { RedactedThinkingBlock } from "../../RedactedThinkingBlock";
import { type ChatMessageBody } from "./ChatMessageController";

export function ChatMessageContent({
  body,
  renderToolResponse,
  children,
}: {
  body: ChatMessageBody;
  renderToolResponse: React.ComponentProps<
    typeof ToolCallInvocationsView
  >["renderResponse"];
  children?: React.ReactNode;
}) {
  const { message, toolCallNumbers, showThinking, showToolCalls } = body;

  return (
    <>
      {showThinking &&
        hasThinkingContent(message) &&
        message.thinking?.map((thinking, index) => (
          <ThinkingBlock
            key={`thinking-${index}`}
            content={thinking.content}
            summary={thinking.summary}
          />
        ))}
      {showThinking &&
        hasRedactedThinkingContent(message) &&
        message.redacted_thinking?.map((thinking, index) => (
          <RedactedThinkingBlock
            key={`redacted-${index}`}
            data={thinking.data}
          />
        ))}
      {children}
      {showToolCalls && (
        <ToolCallInvocationsView
          className={showThinking ? "mt-2" : undefined}
          message={message}
          toolCallNumbers={toolCallNumbers}
          renderResponse={renderToolResponse}
        />
      )}
    </>
  );
}
