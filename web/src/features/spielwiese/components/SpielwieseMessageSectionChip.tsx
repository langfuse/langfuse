import type { ReactNode } from "react";
import { MessageCircle, Settings2, type LucideIcon } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import type { getMessageToneClassNames } from "./spielwieseMessageTone";
import {
  spielwieseMessageSectionChipPaddingStyle,
  spielwieseMessageSectionChipVariableStyle,
} from "./spielwieseAgentNodeColorPalette";

function getMessageSectionPrefixIcon(messageKind: string) {
  if (messageKind === "system" || messageKind === "assistant") {
    return Settings2;
  }

  if (messageKind === "user") {
    return MessageCircle;
  }

  return null;
}

function getMessageSectionChipButtonClassName({
  isFilledChip,
}: {
  isFilledChip: boolean;
}) {
  if (isFilledChip) {
    return "bg-background hover:bg-background h-7 gap-0 overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] px-0 py-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-black/4";
  }

  return "h-auto gap-1.5 rounded-none border-0 bg-transparent pt-[var(--spielwiese-message-section-chip-padding-top)] pr-[var(--spielwiese-message-section-chip-padding-right)] pb-[var(--spielwiese-message-section-chip-padding-bottom)] pl-[var(--spielwiese-message-section-chip-padding-left)] shadow-none hover:bg-transparent";
}

function getMessageSectionChipLabelClassName({
  isFilledChip,
  leadingSurface,
  toneClassNames,
}: {
  isFilledChip: boolean;
  leadingSurface: "embedded" | "plain";
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
}) {
  return cn(
    "min-w-0 font-medium tracking-[-0.01em]",
    isFilledChip && "px-2.5",
    leadingSurface === "embedded"
      ? "text-[12px] leading-4.5"
      : "text-[13px] leading-5",
    toneClassNames.label,
  );
}

function MessageSectionChipPrefix({
  icon: Icon,
  iconTestId,
  leadingSurface,
  messageKind,
  nodeId,
  sectionId,
  toneClassNames,
}: {
  icon: LucideIcon;
  iconTestId?: string;
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
          iconTestId ??
          (messageKind === "user"
            ? `${nodeId}-user-tag-icon`
            : `${nodeId}-${sectionId}-icon`)
        }
      />
    </span>
  );
}

function MessageSectionChipContent({
  iconTestId,
  label,
  leadingSurface,
  messageKind,
  nodeId,
  prefixIcon: PrefixIcon,
  sectionId,
  toneClassNames,
}: {
  iconTestId?: string;
  label: string;
  leadingSurface: "embedded" | "plain";
  messageKind: string;
  nodeId: string;
  prefixIcon: LucideIcon | null;
  sectionId: string;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
}) {
  const isFilledChip = messageKind === "user" && leadingSurface === "plain";

  return (
    <>
      {PrefixIcon ? (
        <MessageSectionChipPrefix
          icon={PrefixIcon}
          iconTestId={iconTestId}
          leadingSurface={leadingSurface}
          messageKind={messageKind}
          nodeId={nodeId}
          sectionId={sectionId}
          toneClassNames={toneClassNames}
        />
      ) : null}
      <div
        className={getMessageSectionChipLabelClassName({
          isFilledChip,
          leadingSurface,
          toneClassNames,
        })}
      >
        {label}
      </div>
    </>
  );
}

function StaticMessageSectionChip({
  chipClassName,
  chipContent,
}: {
  chipClassName: string;
  chipContent: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={chipClassName}
      style={{
        ...spielwieseMessageSectionChipVariableStyle,
        ...spielwieseMessageSectionChipPaddingStyle,
      }}
    >
      {chipContent}
    </div>
  );
}

function InteractiveMessageSectionChip({
  ariaLabel,
  chipClassName,
  chipContent,
  isCollapsed,
  onToggleCollapse,
}: {
  ariaLabel: string;
  chipClassName: string;
  chipContent: ReactNode;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <Button
      aria-expanded={!isCollapsed}
      aria-label={ariaLabel}
      className={chipClassName}
      style={{
        ...spielwieseMessageSectionChipVariableStyle,
        ...spielwieseMessageSectionChipPaddingStyle,
      }}
      variant="ghost"
      onClick={onToggleCollapse}
    >
      {chipContent}
    </Button>
  );
}

type MessageSectionChipButtonProps = {
  interactive?: boolean;
  isCollapsed: boolean;
  label: string;
  leadingSurface: "embedded" | "plain";
  messageKind: string;
  nodeId: string;
  onToggleCollapse: () => void;
  prefixIcon?: LucideIcon | null;
  prefixIconTestId?: string;
  sectionId: string;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
};

export function MessageSectionChipButton({
  interactive = true,
  isCollapsed,
  label,
  leadingSurface,
  messageKind,
  nodeId,
  onToggleCollapse,
  prefixIcon,
  prefixIconTestId,
  sectionId,
  toneClassNames,
}: MessageSectionChipButtonProps) {
  const resolvedPrefixIcon =
    prefixIcon === undefined
      ? getMessageSectionPrefixIcon(messageKind)
      : prefixIcon;
  const isFilledChip = messageKind === "user" && leadingSurface === "plain";
  const chipClassName = cn(
    "hover:text-foreground inline-flex shrink-0 items-center justify-start text-left focus-visible:ring-0 focus-visible:ring-offset-0",
    getMessageSectionChipButtonClassName({ isFilledChip }),
  );
  const chipContent = (
    <MessageSectionChipContent
      iconTestId={prefixIconTestId}
      label={label}
      leadingSurface={leadingSurface}
      messageKind={messageKind}
      nodeId={nodeId}
      prefixIcon={resolvedPrefixIcon}
      sectionId={sectionId}
      toneClassNames={toneClassNames}
    />
  );

  if (!interactive) {
    return (
      <StaticMessageSectionChip
        chipClassName={chipClassName}
        chipContent={chipContent}
      />
    );
  }

  return (
    <InteractiveMessageSectionChip
      ariaLabel={`Toggle ${nodeId} ${label} section`}
      chipClassName={chipClassName}
      chipContent={chipContent}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
}
