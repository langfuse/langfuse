import type { ReactNode } from "react";
import { Brackets, Settings2, type LucideIcon, UserRound } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import { SpielwieseCollapsedPromptPreview } from "./SpielwieseCollapsedPromptPreview";
import { SpielwieseMessageSectionActions } from "./SpielwieseMessageSectionActions";
import {
  getMessageKind,
  getMessageToneClassNames,
  getPlaceholderCount,
} from "./spielwieseMessageTone";

function getMessageSectionPrefixIcon(messageKind: string) {
  if (messageKind === "system") {
    return Settings2;
  }

  if (messageKind === "assistant") {
    return Settings2;
  }

  if (messageKind === "user") {
    return UserRound;
  }

  return null;
}

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
  const prefixIcon = getMessageSectionPrefixIcon(messageKind);

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
      {prefixIcon ? (
        <MessageSectionChipPrefix
          icon={prefixIcon}
          messageKind={messageKind}
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
  icon: Icon,
  messageKind,
  nodeId,
  sectionId,
  toneClassNames,
}: {
  icon: LucideIcon;
  messageKind: string;
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
      <Icon
        className={cn("size-3 shrink-0", toneClassNames.label)}
        data-testid={
          messageKind === "user"
            ? `${nodeId}-user-tag-icon`
            : `${nodeId}-${sectionId}-icon`
        }
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
  inlineAccessory,
  isCollapsed,
  onToggleCollapse,
  nodeId,
  sectionId,
  label,
  value,
}: {
  inlineAccessory?: ReactNode;
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
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-visible">
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
      {inlineAccessory}
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
  inlineAccessory,
  isCollapsed,
  label,
  nodeId,
  onToggleCollapse,
  sectionId,
  value,
}: {
  inlineAccessory?: ReactNode;
  isCollapsed: boolean;
  label: string;
  nodeId: string;
  onToggleCollapse: () => void;
  sectionId: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-visible">
      <MessageSectionSummary
        inlineAccessory={inlineAccessory}
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
  inlineAccessory?: ReactNode;
  isCollapsed: boolean;
  label: string;
  nodeId: string;
  onDelete: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onToggleCollapse: () => void;
  sectionId: string;
  trailingAccessory?: ReactNode;
  value: string;
};

export function SpielwieseMessageSectionHeader({
  canMoveDown,
  canMoveUp,
  inlineAccessory,
  isCollapsed,
  label,
  nodeId,
  onDelete,
  onMoveDown,
  onMoveUp,
  onToggleCollapse,
  sectionId,
  trailingAccessory,
  value,
}: SpielwieseMessageSectionHeaderProps) {
  const toneClassNames = getMessageToneClassNames(sectionId);

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-3",
        toneClassNames.header,
      )}
    >
      <MessageSectionLeading
        inlineAccessory={inlineAccessory}
        isCollapsed={isCollapsed}
        label={label}
        nodeId={nodeId}
        onToggleCollapse={onToggleCollapse}
        sectionId={sectionId}
        value={value}
      />
      <div className="flex shrink-0 items-center gap-1">
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
        {trailingAccessory}
      </div>
    </div>
  );
}
