import type { ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import { SpielwieseCollapsedPromptPreview } from "./SpielwieseCollapsedPromptPreview";
import { MessageSectionChipButton } from "./SpielwieseMessageSectionChip";
import {
  getMessageSectionRevealClassName,
  SpielwieseMessageSectionTrailing,
} from "./SpielwieseMessageSectionHeaderSupport";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";

function MessageSectionSummary({
  inlineAccessory,
  inlineAccessoryRevealMode,
  isCollapsed,
  leadingSurface,
  onToggleCollapse,
  nodeId,
  sectionId,
  label,
  value,
}: {
  inlineAccessory?: ReactNode;
  inlineAccessoryRevealMode: "agent-node" | "section";
  isCollapsed: boolean;
  leadingSurface: "embedded" | "plain";
  onToggleCollapse: () => void;
  nodeId: string;
  sectionId: string;
  label: string;
  value: string;
}) {
  const toneClassNames = getMessageToneClassNames(sectionId);
  const messageKind = getMessageKind(sectionId);
  const inlineAccessoryClassName = getMessageSectionRevealClassName(
    inlineAccessoryRevealMode,
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 overflow-visible",
        leadingSurface === "embedded" && "ml-[3px]",
      )}
    >
      <MessageSectionChipButton
        isCollapsed={isCollapsed}
        label={label}
        leadingSurface={leadingSurface}
        messageKind={messageKind}
        nodeId={nodeId}
        onToggleCollapse={onToggleCollapse}
        sectionId={sectionId}
        toneClassNames={toneClassNames}
      />
      {inlineAccessory ? (
        <div className={inlineAccessoryClassName}>{inlineAccessory}</div>
      ) : null}
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
  inlineAccessoryRevealMode,
  isCollapsed,
  label,
  leadingSurface,
  nodeId,
  onToggleCollapse,
  sectionId,
  value,
}: {
  inlineAccessory?: ReactNode;
  inlineAccessoryRevealMode: "agent-node" | "section";
  isCollapsed: boolean;
  label: string;
  leadingSurface: "embedded" | "plain";
  nodeId: string;
  onToggleCollapse: () => void;
  sectionId: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-visible">
      <MessageSectionSummary
        inlineAccessory={inlineAccessory}
        inlineAccessoryRevealMode={inlineAccessoryRevealMode}
        isCollapsed={isCollapsed}
        label={label}
        leadingSurface={leadingSurface}
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
  controlRevealMode?: "agent-node" | "section";
  inlineAccessory?: ReactNode;
  inlineAccessoryRevealMode?: "agent-node" | "section";
  isCollapsed: boolean;
  label: string;
  leadingSurface?: "embedded" | "plain";
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
  controlRevealMode = "section",
  inlineAccessory,
  inlineAccessoryRevealMode = "section",
  isCollapsed,
  label,
  leadingSurface = "plain",
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
        leadingSurface === "embedded" && "ml-[2px]",
        toneClassNames.header,
      )}
      data-testid="spielwiese-message-section-header"
    >
      <MessageSectionLeading
        inlineAccessory={inlineAccessory}
        inlineAccessoryRevealMode={inlineAccessoryRevealMode}
        isCollapsed={isCollapsed}
        label={label}
        leadingSurface={leadingSurface}
        nodeId={nodeId}
        onToggleCollapse={onToggleCollapse}
        sectionId={sectionId}
        value={value}
      />
      <SpielwieseMessageSectionTrailing
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        controlRevealMode={controlRevealMode}
        label={label}
        nodeId={nodeId}
        onDelete={onDelete}
        onMoveDown={onMoveDown}
        onMoveUp={onMoveUp}
        sectionId={sectionId}
        trailingAccessory={trailingAccessory}
      />
    </div>
  );
}
