import { Brackets, Settings2 } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import { SpielwieseCollapsedPromptPreview } from "./SpielwieseCollapsedPromptPreview";
import { SpielwieseMessageSectionActions } from "./SpielwieseMessageSectionActions";
import {
  getMessageKind,
  getMessageToneClassNames,
  getPlaceholderCount,
} from "./spielwieseMessageTone";

function MessageSectionChipButton({
  isCollapsed,
  label,
  messageKind,
  nodeId,
  onToggleCollapse,
  sectionId,
  toneClassNames,
}: {
  isCollapsed: boolean;
  label: string;
  messageKind: string;
  nodeId: string;
  onToggleCollapse: () => void;
  sectionId: string;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
}) {
  const hasLeadingIcon = messageKind === "system";

  return (
    <Button
      aria-expanded={!isCollapsed}
      aria-label={`Toggle ${nodeId} ${label} section`}
      className={cn(
        "hover:text-foreground inline-flex h-auto shrink-0 items-center justify-start gap-1.5 rounded-none border-0 bg-transparent px-0 py-0 text-left shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0",
      )}
      variant="ghost"
      onClick={onToggleCollapse}
    >
      {hasLeadingIcon ? (
        <MessageSectionChipPrefix
          nodeId={nodeId}
          sectionId={sectionId}
          toneClassNames={toneClassNames}
        />
      ) : null}
      <div
        className={cn(
          "min-w-0 text-[13px] leading-5 font-medium tracking-[-0.01em]",
          toneClassNames.label,
        )}
      >
        {label}
      </div>
    </Button>
  );
}

function MessageSectionChipPrefix({
  nodeId,
  sectionId,
  toneClassNames,
}: {
  nodeId: string;
  sectionId: string;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] border shadow-none",
        toneClassNames.chip,
      )}
      data-prefix="true"
      data-size="20"
      data-suffix="true"
    >
      <Settings2
        className={cn("size-3 shrink-0", toneClassNames.label)}
        data-testid={`${nodeId}-${sectionId}-icon`}
      />
    </span>
  );
}

function MessageSectionMetrics({
  toneClassNames,
  value,
}: {
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
  value: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 text-[0.8125rem] font-medium transition-all",
        toneClassNames.count,
      )}
    >
      <Brackets className="size-2.5 shrink-0 stroke-[2.65px]" />
      <div className="tabular-nums">{getPlaceholderCount(value)}</div>
    </div>
  );
}

function MessageSectionSummary({
  isCollapsed,
  onToggleCollapse,
  nodeId,
  sectionId,
  label,
  value,
}: {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  nodeId: string;
  sectionId: string;
  label: string;
  value: string;
}) {
  const toneClassNames = getMessageToneClassNames(sectionId);
  const messageKind = getMessageKind(sectionId);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      <MessageSectionChipButton
        isCollapsed={isCollapsed}
        label={label}
        messageKind={messageKind}
        nodeId={nodeId}
        onToggleCollapse={onToggleCollapse}
        sectionId={sectionId}
        toneClassNames={toneClassNames}
      />
      <MessageSectionMetrics toneClassNames={toneClassNames} value={value} />
      {isCollapsed ? (
        <SpielwieseCollapsedPromptPreview
          className={toneClassNames.count}
          value={value}
        />
      ) : null}
    </div>
  );
}

function MessageSectionLeading({
  isCollapsed,
  label,
  nodeId,
  onToggleCollapse,
  sectionId,
  value,
}: {
  isCollapsed: boolean;
  label: string;
  nodeId: string;
  onToggleCollapse: () => void;
  sectionId: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
      <MessageSectionSummary
        isCollapsed={isCollapsed}
        label={label}
        nodeId={nodeId}
        onToggleCollapse={onToggleCollapse}
        sectionId={sectionId}
        value={value}
      />
    </div>
  );
}

type SpielwieseMessageSectionHeaderProps = {
  canMoveDown: boolean;
  canMoveUp: boolean;
  isCollapsed: boolean;
  label: string;
  nodeId: string;
  onDelete: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onToggleCollapse: () => void;
  sectionId: string;
  value: string;
};

export function SpielwieseMessageSectionHeader({
  canMoveDown,
  canMoveUp,
  isCollapsed,
  label,
  nodeId,
  onDelete,
  onMoveDown,
  onMoveUp,
  onToggleCollapse,
  sectionId,
  value,
}: SpielwieseMessageSectionHeaderProps) {
  const toneClassNames = getMessageToneClassNames(sectionId);

  return (
    <div
      className={cn(
        "flex min-h-6 w-full items-start justify-between gap-3 py-0.5",
        toneClassNames.header,
      )}
    >
      <MessageSectionLeading
        isCollapsed={isCollapsed}
        label={label}
        nodeId={nodeId}
        onToggleCollapse={onToggleCollapse}
        sectionId={sectionId}
        value={value}
      />
      <SpielwieseMessageSectionActions
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        nodeId={nodeId}
        onDelete={onDelete}
        onMoveDown={onMoveDown}
        onMoveUp={onMoveUp}
        sectionId={sectionId}
        sectionLabel={label}
      />
    </div>
  );
}
