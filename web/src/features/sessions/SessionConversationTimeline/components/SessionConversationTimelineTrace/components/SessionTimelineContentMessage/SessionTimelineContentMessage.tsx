import React, { useState } from "react";
import { Bot, ChevronDown, UserRound, Wrench } from "lucide-react";
import { type ReasoningPart } from "@langfuse/shared/src/utils/normalized-io";

import { type SessionTimelineConversationMessage } from "@/src/features/sessions/SessionConversationTimeline/fns/processTimelineMessages";
import { SessionTimelinePart } from "@/src/features/sessions/SessionConversationTimeline/components/SessionTimelinePart/SessionTimelinePart";
import { cn } from "@/src/utils/tailwind";

const rolePresentation = {
  user: {
    label: "User",
    icon: UserRound,
    wrapper: "justify-end",
    container: "bg-muted max-w-[min(85%,48rem)] rounded-2xl px-4 py-2.5",
  },
  assistant: {
    label: "Assistant",
    icon: Bot,
    wrapper: "justify-start",
    container: "bg-muted/50 max-w-[min(85%,48rem)] rounded-2xl px-4 py-2.5",
  },
  tool: {
    label: "Tool",
    icon: Wrench,
    wrapper: "justify-start",
    container: "w-full",
  },
} satisfies Record<
  Exclude<SessionTimelineConversationMessage["role"], "system">,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    wrapper: string;
    container: string;
  }
>;

export function SessionTimelineContentMessage({
  role,
  parts,
  senderName,
}: {
  role: Exclude<SessionTimelineConversationMessage["role"], "system">;
  parts: SessionTimelineConversationMessage["parts"];
  senderName: SessionTimelineConversationMessage["senderName"];
}) {
  const presentation = rolePresentation[role];
  const Icon = presentation.icon;
  const showSender = Boolean(senderName && senderName !== presentation.label);
  const [expandedJsonGroupIndices, setExpandedJsonGroupIndices] = useState(
    () => new Set<number>(),
  );
  type MessagePart = SessionTimelineConversationMessage["parts"][number];
  type ContentPart = Exclude<MessagePart, ReasoningPart>;
  const groups: Array<
    | { type: "reasoning"; parts: ReasoningPart[] }
    | { type: "content"; parts: ContentPart[] }
  > = [];

  for (const part of parts) {
    const previousGroup = groups.at(-1);
    if (part.type === "reasoning") {
      if (previousGroup?.type === "reasoning") {
        previousGroup.parts.push(part);
      } else {
        groups.push({ type: "reasoning", parts: [part] });
      }
      continue;
    }

    if (previousGroup?.type === "content") {
      previousGroup.parts.push(part);
    } else {
      groups.push({ type: "content", parts: [part] });
    }
  }

  const firstContentGroupIndex = groups.findIndex(
    (group) => group.type === "content",
  );

  return (
    <div className="ph-no-capture flex w-full flex-col gap-2">
      {groups.map((group, groupIndex) => {
        if (group.type === "reasoning") {
          return (
            <div
              key={`reasoning-${groupIndex}`}
              className="flex w-full flex-col gap-1"
            >
              {group.parts.map((part, partIndex) => (
                <SessionTimelinePart
                  key={`${part.content.kind}-${partIndex}`}
                  part={part}
                />
              ))}
            </div>
          );
        }

        const isJsonOnly = group.parts.every(
          (part) => part.type === "data" || part.type === "custom",
        );
        const isJsonExpanded = expandedJsonGroupIndices.has(groupIndex);

        return (
          <div
            key={`content-${groupIndex}`}
            className={cn("flex w-full", presentation.wrapper)}
          >
            <article
              className={cn("min-w-0 overflow-hidden", presentation.container)}
            >
              {showSender && groupIndex === firstContentGroupIndex ? (
                <div className="text-foreground mb-1 flex min-w-0 items-center gap-1.5 font-mono text-[11px]">
                  <Icon className="h-3 w-3 shrink-0" />
                  <span
                    className="text-foreground truncate"
                    title={senderName ?? presentation.label}
                  >
                    {senderName ?? presentation.label}
                  </span>
                </div>
              ) : null}
              {isJsonOnly ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 text-left font-mono text-xs transition-colors"
                  aria-expanded={isJsonExpanded}
                  onClick={() =>
                    setExpandedJsonGroupIndices((current) => {
                      const next = new Set(current);
                      if (isJsonExpanded) next.delete(groupIndex);
                      else next.add(groupIndex);
                      return next;
                    })
                  }
                >
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 shrink-0 transition-transform",
                      !isJsonExpanded && "-rotate-90",
                    )}
                    aria-hidden="true"
                  />
                  JSON-only message detected
                </button>
              ) : null}
              {!isJsonOnly || isJsonExpanded ? (
                <div
                  className={cn(
                    "flex flex-col gap-2 text-sm leading-6",
                    isJsonOnly && "mt-2",
                  )}
                >
                  {group.parts.map((part, partIndex) => (
                    <SessionTimelinePart
                      key={`${part.type}-${partIndex}`}
                      part={part}
                    />
                  ))}
                </div>
              ) : null}
            </article>
          </div>
        );
      })}
    </div>
  );
}
