import type { ReactNode } from "react";
import { Settings2, type LucideIcon, UserRound } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import { SpielwieseCollapsedPromptPreview } from "./SpielwieseCollapsedPromptPreview";
import {
  getMessageSectionRevealClassName,
  SpielwieseMessageSectionTrailing,
} from "./SpielwieseMessageSectionHeaderSupport";
import {
  getMessageKind,
  getMessageToneClassNames,
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
  leadingSurface,
  messageKind,
  nodeId,
  onToggleCollapse,
  sectionId,
  toneClassNames,
}: {
  isCollapsed: boolean;
  label: string;
  leadingSurface: "embedded" | "plain";
  messageKind: string;
  nodeId: string;
  onToggleCollapse: () => void;
  sectionId: string;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
}) {
  const prefixIcon = getMessageSectionPrefixIcon(messageKind);
  const isFilledChip = messageKind === "user" && leadingSurface === "plain";

  return (
    <Button
      aria-expanded={!isCollapsed}
      aria-label={`Toggle ${nodeId} ${label} section`}
      className={cn(
        "hover:text-foreground inline-flex shrink-0 items-center justify-start text-left focus-visible:ring-0 focus-visible:ring-offset-0",
        isFilledChip
          ? "bg-background hover:bg-background h-7 gap-0 overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] px-0 py-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-black/4"
          : "h-auto gap-1.5 rounded-none border-0 bg-transparent px-0 py-0 shadow-none hover:bg-transparent",
      )}
      variant="ghost"
      onClick={onToggleCollapse}
    >
      {prefixIcon ? (
        <MessageSectionChipPrefix
          icon={prefixIcon}
          leadingSurface={leadingSurface}
          messageKind={messageKind}
          nodeId={nodeId}
          sectionId={sectionId}
          toneClassNames={toneClassNames}
        />
      ) : null}
      <div
        className={cn(
          "min-w-0 font-medium tracking-[-0.01em]",
          isFilledChip && "px-2.5",
          leadingSurface === "embedded"
            ? "text-[12px] leading-4.5"
            : "text-[13px] leading-5",
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
  leadingSurface,
  messageKind,
  nodeId,
  sectionId,
  toneClassNames,
}: {
  icon: LucideIcon;
  leadingSurface: "embedded" | "plain";
  messageKind: string;
  nodeId: string;
  sectionId: string;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
}) {
  const isFilledChip = messageKind === "user" && leadingSurface === "plain";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center shadow-none",
        isFilledChip
          ? "h-full w-6 border-r border-[rgba(0,0,0,0.05)] bg-[rgba(0,0,0,0.02)]"
          : cn(
              "border",
              leadingSurface === "embedded"
                ? "size-4 rounded-[5px]"
                : "size-5 rounded-[6px]",
              toneClassNames.chip,
            ),
      )}
      data-prefix="true"
      data-size="20"
      data-suffix="true"
    >
      <Icon
        className={cn(
          leadingSurface === "embedded" ? "size-2.5" : "size-3",
          "shrink-0",
          toneClassNames.label,
        )}
        data-testid={
          messageKind === "user"
            ? `${nodeId}-user-tag-icon`
            : `${nodeId}-${sectionId}-icon`
        }
      />
    </span>
  );
}

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
