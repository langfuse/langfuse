import { CircleAlert } from "lucide-react";
import { type ReactNode } from "react";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { renderFilterIcon } from "@/src/components/ItemBadge";
import { SessionTimelineCollapsibleRow } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineCollapsibleRow/SessionTimelineCollapsibleRow";

const hasPreviewValue = (value: unknown) =>
  value !== null && value !== undefined && value !== "";

export function SessionTimelineToolRow({
  name,
  input,
  output,
  isExpanded,
  onExpandedChange,
  isError,
  trailingContent,
}: {
  name: string;
  input: unknown;
  output: unknown;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  isError?: boolean;
  trailingContent?: ReactNode;
}) {
  return (
    <SessionTimelineCollapsibleRow
      label={name}
      searchableLabel
      icon={renderFilterIcon("TOOL")}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
      trailingContent={
        <>
          {trailingContent}
          {isError ? (
            <CircleAlert
              className="icon-sm text-destructive"
              aria-label="Failed"
            />
          ) : null}
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-3 pl-[22px]">
        {hasPreviewValue(input) ? (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
              Input
            </span>
            <div className="grid max-h-48 min-w-0">
              <Codeblock label="Tool input" value={input} allowFormatting />
            </div>
          </div>
        ) : null}
        {hasPreviewValue(output) ? (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
              Output
            </span>
            <div className="grid max-h-96 min-w-0">
              <Codeblock label="Tool output" value={output} allowFormatting />
            </div>
          </div>
        ) : null}
        {!hasPreviewValue(input) && !hasPreviewValue(output) ? (
          <div className="relative">
            <span className="text-muted-foreground text-xs">
              No input or output
            </span>
          </div>
        ) : null}
      </div>
    </SessionTimelineCollapsibleRow>
  );
}
