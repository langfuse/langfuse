import { useState, type ReactNode } from "react";
import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";
import { SessionTimelineCollapsibleRow } from "@/src/features/sessions/SessionConversationTimeline/components/SessionTimelineCollapsibleRow/SessionTimelineCollapsibleRow";
import { SessionTimelinePart } from "@/src/features/sessions/SessionConversationTimeline/components/SessionTimelinePart/SessionTimelinePart";

export function SessionTimelineSystemMessage({
  parts,
  senderName,
  trailingContent,
}: {
  parts: NormalizedMessage["parts"];
  senderName: NormalizedMessage["senderName"];
  trailingContent?: ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className="ph-no-capture flex w-full">
      <SessionTimelineCollapsibleRow
        label={senderName ?? "System prompt"}
        isExpanded={isExpanded}
        onExpandedChange={setIsExpanded}
        trailingContent={trailingContent}
      >
        <div className="text-muted-foreground flex flex-col gap-2 text-sm">
          {parts.map((part, index) => (
            <SessionTimelinePart key={`${part.type}-${index}`} part={part} />
          ))}
        </div>
      </SessionTimelineCollapsibleRow>
    </div>
  );
}
