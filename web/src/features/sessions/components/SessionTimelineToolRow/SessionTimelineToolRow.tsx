import { CircleAlert } from "lucide-react";
import { type ReactNode } from "react";
import { renderFilterIcon } from "@/src/components/ItemBadge";
import { SessionTimelineCollapsibleRow } from "@/src/features/sessions/components/SessionTimelineCollapsibleRow/SessionTimelineCollapsibleRow";
import { decodeUnicodeEscapesOnly } from "@/src/utils/unicode";

const toPreviewText = (value: unknown) => {
  const text =
    typeof value === "string"
      ? value
      : (JSON.stringify(value, undefined, 2) ?? String(value));
  return decodeUnicodeEscapesOnly(text, true);
};

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
              className="text-destructive h-3 w-3"
              aria-label="Failed"
            />
          ) : null}
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-3 pl-[22px]">
        {hasPreviewValue(input) ? (
          <div className="relative flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
              Input
            </span>
            <pre className="bg-muted/30 max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap">
              {toPreviewText(input)}
            </pre>
          </div>
        ) : null}
        {hasPreviewValue(output) ? (
          <div className="relative flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
              Output
            </span>
            <pre className="bg-muted/30 max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap">
              {toPreviewText(output)}
            </pre>
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
