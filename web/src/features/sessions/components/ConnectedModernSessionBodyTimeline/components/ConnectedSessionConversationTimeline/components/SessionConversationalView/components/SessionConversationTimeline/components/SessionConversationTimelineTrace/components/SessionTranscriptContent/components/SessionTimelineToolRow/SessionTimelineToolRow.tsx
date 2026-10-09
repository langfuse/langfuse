import { Bug, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { type ReactNode } from "react";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { renderFilterIcon } from "@/src/components/ItemBadge";
import { SessionTimelineCollapsibleRow } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineCollapsibleRow/SessionTimelineCollapsibleRow";
import { cn } from "@/src/utils/tailwind";
import { SessionToolTooltip } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionToolTooltip/SessionToolTooltip";
import { type Observation } from "@langfuse/shared";


const hasPreviewValue = (value: unknown) =>
  value !== null && value !== undefined && value !== "";

export function SessionTimelineToolRow({
  name,
  input,
  output,
  isExpanded,
  onExpandedChange,
  level,
  statusMessage,
  trailingContent,
}: {
  name: string;
  input: unknown;
  output: unknown;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  level?: Observation["level"];
  statusMessage?: Observation["statusMessage"];
  trailingContent?: ReactNode;
}) {
  const StatusIcon = level
    ? (
        {
          ERROR: CircleAlert,
          WARNING: TriangleAlert,
          DEFAULT: Info,
          DEBUG: Bug,
        } satisfies Record<Observation["level"], typeof CircleAlert>
      )[level]
    : null;
  return (
    <SessionTimelineCollapsibleRow
      label={name}
      searchableLabel
      icon={renderFilterIcon("TOOL")}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
      trailingContent={trailingContent}
      labelTrailingContent={
        <>
          {level &&
          StatusIcon &&
          (statusMessage || level === "WARNING" || level === "ERROR") ? (
            <SessionToolTooltip
              variant="timeline"
              content={{
                type: "status",
                name,
                level,
                message: statusMessage || level,
              }}
            >
              {({ getTriggerProps }) => (
                <span
                  {...getTriggerProps()}
                  tabIndex={0}
                  aria-label={`Tool status: ${level}`}
                  className={cn(
                    "ml-1 flex shrink-0 items-center",
                    (
                      {
                        ERROR: "text-destructive",
                        WARNING: "text-yellow-600 dark:text-yellow-500",
                        DEFAULT:
                          "text-muted-foreground invisible group-focus-within/collapsible-row:visible group-hover/collapsible-row:visible group-data-[expanded=true]/collapsible-row:visible",
                        DEBUG:
                          "text-muted-foreground invisible group-focus-within/collapsible-row:visible group-hover/collapsible-row:visible group-data-[expanded=true]/collapsible-row:visible",
                      } satisfies Record<Observation["level"], string>
                    )[level],
                  )}
                >
                  <StatusIcon className="icon-sm" aria-hidden="true" />
                </span>
              )}
            </SessionToolTooltip>
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
