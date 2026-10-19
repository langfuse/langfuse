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
  outputContent,
  isExpanded,
  onExpandedChange,
  level,
  statusMessage,
  trailingContent,
}: {
  name: string;
  input: unknown;
  output: unknown;
  outputContent?: ReactNode;
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
        level &&
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
                      ERROR: "dark:text-dark-red/90 text-red-800",
                      WARNING: "dark:text-dark-yellow text-yellow-800",
                      DEFAULT:
                        "text-muted-foreground opacity-0 group-hover/collapsible-row:opacity-100 group-has-[:focus-visible]/collapsible-row:opacity-100 group-data-[expanded=true]/collapsible-row:opacity-100",
                      DEBUG:
                        "text-muted-foreground opacity-0 group-hover/collapsible-row:opacity-100 group-has-[:focus-visible]/collapsible-row:opacity-100 group-data-[expanded=true]/collapsible-row:opacity-100",
                    } satisfies Record<Observation["level"], string>
                  )[level],
                )}
              >
                <StatusIcon className="icon-sm" aria-hidden="true" />
              </span>
            )}
          </SessionToolTooltip>
        ) : null
      }
    >
      <div className="flex min-w-0 flex-col gap-3 pl-[22px]">
        {hasPreviewValue(input) ? (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
              Input
            </span>
            <div className="flex max-h-48 min-w-0 flex-col">
              <Codeblock label="Tool input" value={input} allowFormatting />
            </div>
          </div>
        ) : null}
        {outputContent || hasPreviewValue(output) ? (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
              Output
            </span>
            {outputContent ?? (
              <div className="flex max-h-96 min-w-0 flex-col">
                <Codeblock label="Tool output" value={output} allowFormatting />
              </div>
            )}
          </div>
        ) : null}
        {!hasPreviewValue(input) &&
        !hasPreviewValue(output) &&
        !outputContent ? (
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
