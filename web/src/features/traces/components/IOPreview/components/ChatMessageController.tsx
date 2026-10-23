import { useState } from "react";
import { type OpenAIOutputAudioType, stringify } from "@langfuse/shared";
import { ListChevronsDownUp, ListChevronsUpDown } from "@langfuse/icons";
import { type IOSectionAction } from "@/src/components/ui/IOSection";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import {
  type ChatMlMessage,
  hasRenderableContent,
  hasAdditionalData,
  hasPassthroughJson,
  isPlaceholderMessage,
  isOnlyJsonMessage,
  parseToolCallsFromMessage,
  hasThinkingContent,
  hasRedactedThinkingContent,
  withoutUnsetFields,
} from "../../../fns/chatMessageUtils";
import { type IOPreviewContentMode } from "../IOPreview";

export interface ChatMessageBody {
  message: ChatMlMessage;
  toolCallNumbers?: number[];
  showThinking: boolean;
  showToolCalls: boolean;
}

type MessageData =
  | { kind: "collapsed" }
  | { kind: "tools" }
  | { kind: "data"; value: unknown; passthrough: boolean }
  | {
      kind: "message";
      title: string;
      content: unknown;
      originalContent: unknown;
      audio?: OpenAIOutputAudioType;
      includeMessageExtras: boolean;
    };

type RenderChatMessage = (state: {
  title: string;
  data: MessageData;
  body: ChatMessageBody;
  actions: IOSectionAction[];
  isSystemPrompt: boolean;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  copy: () => void;
}) => React.ReactNode;

export function ChatMessageController({
  message,
  toolCallNumbers,
  isOutputMessage,
  contentMode = "all",
  defaultCollapsed,
  title,
  actions: extraActions,
  children,
}: {
  message: ChatMlMessage;
  toolCallNumbers?: number[];
  isOutputMessage?: boolean;
  contentMode?: IOPreviewContentMode;
  defaultCollapsed?: boolean;
  title: string;
  actions?: IOSectionAction[];
  children: RenderChatMessage;
}) {
  const [showPassthrough, setShowPassthrough] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  const sectionTitle = title || (isOutputMessage ? "Output" : "Input");
  const showData = contentMode !== "conversation";

  const data = ((): MessageData | { kind: "empty" } => {
    // Avoid content parsing while the caller is rendering only the header.
    if (collapsed) return { kind: "collapsed" };
    if (isPlaceholderMessage(message)) {
      return {
        kind: "message",
        title: "Placeholder",
        content: message.name || "Unnamed placeholder",
        originalContent: message.name || "Unnamed placeholder",
        includeMessageExtras: false,
      };
    }
    if (isOnlyJsonMessage(message)) {
      return { kind: "data", value: message.json, passthrough: false };
    }
    if (showPassthrough) {
      return { kind: "data", value: message.json, passthrough: true };
    }
    if (
      hasRenderableContent(message) ||
      hasThinkingContent(message) ||
      hasRedactedThinkingContent(message)
    ) {
      return {
        kind: "message",
        title: sectionTitle,
        content: message.content || "",
        originalContent: message.content,
        audio: message.audio,
        includeMessageExtras: true,
      };
    }
    if (parseToolCallsFromMessage(message).length > 0) return { kind: "tools" };
    if (hasAdditionalData(message)) {
      return {
        kind: "data",
        value: withoutUnsetFields(message),
        passthrough: false,
      };
    }
    return { kind: "empty" };
  })();

  if (data.kind === "empty") return null;

  const passthroughAction: IOSectionAction | undefined =
    !collapsed && showData && hasPassthroughJson(message)
      ? {
          icon: showPassthrough ? ListChevronsDownUp : ListChevronsUpDown,
          label: showPassthrough
            ? "Show formatted view"
            : "Show passthrough JSON data",
          onClick: () => setShowPassthrough((value) => !value),
          active: showPassthrough,
        }
      : undefined;
  const includeMessageExtras =
    data.kind === "message" && data.includeMessageExtras;

  return children({
    title: data.kind === "message" ? data.title : sectionTitle,
    data,
    body: {
      message,
      toolCallNumbers,
      showThinking: includeMessageExtras,
      showToolCalls:
        data.kind === "tools" ||
        (includeMessageExtras &&
          showData &&
          parseToolCallsFromMessage(message).length > 0),
    },
    actions: collapsed
      ? []
      : [
          ...(passthroughAction ? [passthroughAction] : []),
          ...(extraActions ?? []),
        ],
    // Display titles may be names, so collapse eligibility uses the raw role.
    isSystemPrompt: includeMessageExtras && message.role === "system",
    collapsed,
    setCollapsed,
    // Decode escaped Unicode consistently with the rendered view.
    copy: () => copyTextToClipboard(stringify(message, undefined, 2)),
  });
}
