"use client";

import { Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";
import { cn } from "@/src/utils/tailwind";

export type InAppAgentMessageRole = "assistant" | "user";

export type InAppAgentMessageContent =
  | { type: "loading"; label?: string }
  | { type: "text"; text: string };

export type InAppAgentMessageProps = {
  role: InAppAgentMessageRole;
  content: InAppAgentMessageContent;
};

export function InAppAgentMessage({ role, content }: InAppAgentMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-3 text-sm shadow-xs",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-card text-card-foreground border-border border",
      )}
    >
      {content.type === "loading" ? (
        <ThinkingIndicator label={content.label} />
      ) : (
        <MessageText role={role} text={content.text} />
      )}
    </div>
  );
}

function MessageText({
  role,
  text,
}: {
  role: InAppAgentMessageRole;
  text: string;
}) {
  if (role === "user") {
    return <p className="leading-6 whitespace-pre-wrap">{text}</p>;
  }

  return (
    <div className="assistant-streamdown text-sm leading-6">
      <Streamdown>{text}</Streamdown>
    </div>
  );
}

function ThinkingIndicator({
  className,
  label = "Thinking...",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 text-sm", className)}>
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
