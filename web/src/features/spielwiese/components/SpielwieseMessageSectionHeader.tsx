import { Brackets, ChevronDown, Settings2 } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import { SpielwieseCollapsedPromptPreview } from "./SpielwieseCollapsedPromptPreview";
import { SpielwieseMessageSectionActions } from "./SpielwieseMessageSectionActions";
import {
  getMessageKind,
  getMessageToneClassNames,
  getPlaceholderCount,
} from "./spielwieseMessageTone";

function MessageSectionSummary({
  isCollapsed,
  nodeId,
  sectionId,
  label,
  value,
}: {
  isCollapsed: boolean;
  nodeId: string;
  sectionId: string;
  label: string;
  value: string;
}) {
  const toneClassNames = getMessageToneClassNames(sectionId);
  const messageKind = getMessageKind(sectionId);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
      {messageKind === "system" ? (
        <Settings2
          aria-hidden="true"
          className={cn("size-3.5 shrink-0", toneClassNames.label)}
          data-testid={`${nodeId}-${sectionId}-icon`}
        />
      ) : null}
      <div
        className={cn(
          "flex h-5 shrink-0 items-center px-0.5 text-[11px] font-semibold tracking-[0.01em]",
          toneClassNames.label,
        )}
      >
        {label}
      </div>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 text-[11px] font-semibold transition-all",
          toneClassNames.count,
        )}
      >
        <Brackets className="size-2.5 shrink-0 stroke-[2.65px]" />
        <span className="tabular-nums">{getPlaceholderCount(value)}</span>
      </span>
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
  const toneClassNames = getMessageToneClassNames(sectionId);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
      <Button
        aria-expanded={!isCollapsed}
        aria-label={`Toggle ${nodeId} ${label} section`}
        className={cn("h-6 w-6 shrink-0 rounded-md", toneClassNames.action)}
        size="icon-sm"
        variant="ghost"
        onClick={onToggleCollapse}
      >
        <ChevronDown
          className={cn(
            "size-3 transition-transform",
            isCollapsed && "-rotate-90",
          )}
        />
      </Button>
      <MessageSectionSummary
        isCollapsed={isCollapsed}
        label={label}
        nodeId={nodeId}
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
        "flex min-h-8 w-full items-center justify-between pr-2.5 pl-1.5",
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
