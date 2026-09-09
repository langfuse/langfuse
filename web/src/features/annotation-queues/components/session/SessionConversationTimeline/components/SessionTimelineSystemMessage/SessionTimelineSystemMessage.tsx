import { type SessionTimelineConversationMessage } from "@/src/features/annotation-queues/components/session/SessionConversationTimeline/fns/processTimelineMessages";
import { SessionTimelineCollapsiblePart } from "@/src/features/annotation-queues/components/session/SessionConversationTimeline/components/SessionTimelineCollapsiblePart/SessionTimelineCollapsiblePart";
import { SessionTimelinePart } from "@/src/features/annotation-queues/components/session/SessionConversationTimeline/components/SessionTimelinePart/SessionTimelinePart";

export function SessionTimelineSystemMessage({
  parts,
  senderName,
}: {
  parts: SessionTimelineConversationMessage["parts"];
  senderName: SessionTimelineConversationMessage["senderName"];
}) {
  return (
    <div className="ph-no-capture flex w-full">
      <SessionTimelineCollapsiblePart
        label={senderName ?? "System prompt"}
        variant="plain"
        alignment="row"
      >
        <div className="text-muted-foreground flex flex-col gap-2 text-sm leading-6">
          {parts.map((part, index) => (
            <SessionTimelinePart key={`${part.type}-${index}`} part={part} />
          ))}
        </div>
      </SessionTimelineCollapsiblePart>
    </div>
  );
}
