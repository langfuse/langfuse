/**
 * SessionInspectorIOZones — the mock's INPUT / System prompt / OUTPUT zones
 * for the session inspector's Formatted view.
 *
 * The handoff renders generation I/O as dark "code well" frames in BOTH
 * themes: an INPUT frame with a `messages · chatml` strip, role-colored
 * message eyebrows and mono text (long histories collapse to the last 3
 * messages), a collapsible System-prompt row below the frame, and an OUTPUT
 * zone whose header hosts the Correct action.
 *
 * Deliberately conservative, like the transcript's `buildTurnModel`:
 * `buildSessionIOZonesModel` returns null whenever the payload doesn't
 * cleanly fit this shape (tool calls, thinking blocks, non-text content,
 * passthrough JSON, extra input params) and the caller falls back to the
 * standard IOPreview — the redesign must never hide data it cannot express.
 */

import React from "react";
import { ChevronDown, SquarePen } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { type ChatMLParserResult } from "@/src/components/trace/components/IOPreview/hooks/useChatMLParser";
import {
  hasPassthroughJson,
  hasRedactedThinkingContent,
  hasThinkingContent,
  isOnlyJsonMessage,
  isPlaceholderMessage,
  parseToolCallsFromMessage,
} from "@/src/components/trace/components/IOPreview/components/chat-message-utils";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { cn } from "@/src/utils/tailwind";

type ZoneMessage = { role: string; text: string };

export type SessionIOZonesModel = {
  /** Non-system input messages, in order. */
  inputMessages: ZoneMessage[];
  /** System prompt(s), extracted into the collapsible row below the frame. */
  systemMessages: string[];
  /** Output messages (usually one assistant message). */
  outputMessages: ZoneMessage[];
};

/** Plain text of a ChatML content value; null when not purely textual. */
const contentToText = (content: unknown): string | null => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (typeof part === "string") parts.push(part);
      else if (
        part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string" &&
        ((part as { type?: unknown }).type === undefined ||
          (part as { type?: unknown }).type === "text")
      )
        parts.push((part as { text: string }).text);
      else return null;
    }
    return parts.length > 0 ? parts.join("\n") : null;
  }
  return null;
};

/**
 * Builds the zones model from a ChatML parse. Null (→ caller falls back to
 * IOPreview) whenever any message carries more than plain text.
 */
export const buildSessionIOZonesModel = (
  parsed: ChatMLParserResult,
): SessionIOZonesModel | null => {
  if (!parsed.canDisplayAsChat) return null;
  // Extra input params (temperature, tools, …) have no zone here.
  if (parsed.additionalInput && Object.keys(parsed.additionalInput).length > 0)
    return null;
  if (parsed.allTools.length > 0) return null;

  const inputMessages: ZoneMessage[] = [];
  const systemMessages: string[] = [];
  const outputMessages: ZoneMessage[] = [];

  for (let i = 0; i < parsed.allMessages.length; i++) {
    const message = parsed.allMessages[i];
    if (
      isPlaceholderMessage(message) ||
      isOnlyJsonMessage(message) ||
      hasPassthroughJson(message) ||
      hasThinkingContent(message) ||
      hasRedactedThinkingContent(message) ||
      parseToolCallsFromMessage(message).length > 0
    )
      return null;
    const text = contentToText(message.content);
    if (text === null || text.trim() === "") return null;
    const isOutput = i >= parsed.inputMessageCount;
    const role =
      typeof message.role === "string" && message.role !== ""
        ? message.role
        : isOutput
          ? "assistant"
          : "user";
    if (isOutput) outputMessages.push({ role, text });
    else if (role === "system") systemMessages.push(text);
    else inputMessages.push({ role, text });
  }

  if (inputMessages.length === 0 || outputMessages.length === 0) return null;
  return { inputMessages, systemMessages, outputMessages };
};

/* Mock code-well palette — dark frames in BOTH themes (the handoff's
   "code is a well" treatment); tokens live in globals.css. */
const FRAME = "border-code-well-border bg-code-well rounded-sm border";
const STRIP = "bg-code-well-strip";
const CODE_INK = "text-code-well-ink";
const CODE_MUTED = "text-code-well-muted";
const ROLE_COLORS: Record<string, string> = {
  user: "text-code-role-user",
  assistant: "text-code-role-assistant",
};

const ZoneEyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted-foreground font-mono text-[10px] tracking-[0.05em] uppercase">
    {children}
  </span>
);

const MessageBlock = ({ role, text }: ZoneMessage) => (
  <div>
    <div
      className={cn(
        "font-mono text-[10px] tracking-[0.04em] uppercase",
        ROLE_COLORS[role.toLowerCase()] ?? CODE_MUTED,
      )}
    >
      {role}
    </div>
    <div
      className={cn(
        "mt-0.5 font-mono text-xs leading-[1.7] break-words whitespace-pre-wrap",
        CODE_INK,
      )}
    >
      {text}
    </div>
  </div>
);

export function SessionInspectorIOZones({
  model,
  rawInput,
  correction,
}: {
  model: SessionIOZonesModel;
  /** Raw input payload for the frame's copy control. */
  rawInput: unknown;
  /** Correct action for the OUTPUT header (generations with access only). */
  correction?: { hasExisting: boolean; onToggle: () => void };
}) {
  const [showAllInput, setShowAllInput] = React.useState(false);
  const [isSystemOpen, setIsSystemOpen] = React.useState(false);
  const [isCopied, setIsCopied] = React.useState(false);

  const hiddenCount = showAllInput
    ? 0
    : Math.max(0, model.inputMessages.length - 3);
  const visibleInput =
    hiddenCount > 0 ? model.inputMessages.slice(-3) : model.inputMessages;

  const handleCopy = () => {
    const text =
      typeof rawInput === "string"
        ? rawInput
        : JSON.stringify(rawInput, null, 2);
    copyTextToClipboard(text ?? "").catch(() => undefined);
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1200);
  };

  return (
    <div className="flex flex-col">
      {/* INPUT zone */}
      <div className="px-4 pt-3 pb-4">
        <div className="mb-2">
          <ZoneEyebrow>input</ZoneEyebrow>
        </div>
        <div className={cn("overflow-hidden", FRAME)}>
          <div className={cn("flex items-center justify-between p-2", STRIP)}>
            <span className={cn("font-mono text-[10px]", CODE_MUTED)}>
              messages · chatml
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                "hover:text-code-well-bright cursor-pointer font-mono text-[10px]",
                CODE_MUTED,
              )}
            >
              {isCopied ? "copied" : "copy"}
            </button>
          </div>
          <div className="flex flex-col gap-4 p-4">
            {hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowAllInput(true)}
                className={cn(
                  "hover:text-code-well-bright cursor-pointer self-start font-mono text-[11px]",
                  CODE_MUTED,
                )}
              >
                ⌄ show {hiddenCount} earlier{" "}
                {hiddenCount === 1 ? "message" : "messages"}
              </button>
            ) : null}
            {visibleInput.map((message, index) => (
              <MessageBlock key={index} {...message} />
            ))}
          </div>
        </div>
        {model.systemMessages.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setIsSystemOpen((current) => !current)}
              className="border-border-contrast text-muted-foreground hover:text-foreground flex w-full items-center gap-2 border-b border-dashed py-2 text-left transition-colors duration-150"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                  isSystemOpen ? "rotate-0" : "-rotate-90",
                )}
                strokeWidth={1.6}
              />
              <span className="text-xs font-bold whitespace-nowrap">
                System prompt
              </span>
            </button>
            {isSystemOpen ? (
              <div className="text-muted-foreground pt-2 font-mono text-xs leading-[1.7] break-words whitespace-pre-wrap">
                {model.systemMessages.join("\n\n")}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {/* OUTPUT zone */}
      <div className="px-4 pb-4">
        <div className="mb-2 flex min-h-7 items-center justify-between">
          <ZoneEyebrow>output</ZoneEyebrow>
          {correction ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              title={
                correction.hasExisting
                  ? "Has correction — open the corrected-output editor"
                  : "Correct this output"
              }
              onClick={correction.onToggle}
            >
              <SquarePen className="mr-1 h-3.5 w-3.5" />
              Correct
              {correction.hasExisting ? (
                <span className="bg-dark-yellow ml-1 h-1.5 w-1.5 rounded-full" />
              ) : null}
            </Button>
          ) : null}
        </div>
        <div className={cn("flex flex-col gap-4 p-4", FRAME)}>
          {model.outputMessages.map((message, index) => (
            <MessageBlock key={index} {...message} />
          ))}
        </div>
      </div>
    </div>
  );
}
