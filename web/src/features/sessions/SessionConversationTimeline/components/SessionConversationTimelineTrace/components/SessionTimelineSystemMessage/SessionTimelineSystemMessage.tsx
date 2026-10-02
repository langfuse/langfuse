import { type ReactNode } from "react";
import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";
import { SessionTimelineCollapsiblePart } from "@/src/features/sessions/SessionConversationTimeline/components/SessionTimelineCollapsiblePart/SessionTimelineCollapsiblePart";
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
  return (
    <div className="ph-no-capture flex w-full">
      <SessionTimelineCollapsiblePart
        label={senderName ?? "System prompt"}
        variant="plain"
        alignment="row"
        trailingContent={trailingContent}
      >
        <div className="text-muted-foreground flex flex-col gap-2 text-sm">
          {parts.map((part, index) => (
            <SessionTimelinePart key={`${part.type}-${index}`} part={part} />
          ))}
        </div>
      </SessionTimelineCollapsiblePart>
    </div>
  );
}
