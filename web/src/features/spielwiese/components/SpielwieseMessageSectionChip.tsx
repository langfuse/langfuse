import { Settings2, type LucideIcon, UserRound } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import type { getMessageToneClassNames } from "./spielwieseMessageTone";

function getMessageSectionPrefixIcon(messageKind: string) {
  if (messageKind === "system" || messageKind === "assistant") {
    return Settings2;
  }

  if (messageKind === "user") {
    return UserRound;
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

  return "h-auto gap-1.5 rounded-none border-0 bg-transparent px-0 py-0 shadow-none hover:bg-transparent";
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

function MessageSectionChipContent({
  label,
  leadingSurface,
  messageKind,
  nodeId,
  prefixIcon: PrefixIcon,
  sectionId,
  toneClassNames,
}: {
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

export function MessageSectionChipButton({
  interactive = true,
  isCollapsed,
  label,
  leadingSurface,
  messageKind,
  nodeId,
  onToggleCollapse,
  sectionId,
  toneClassNames,
}: {
  interactive?: boolean;
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
  const chipClassName = cn(
    "hover:text-foreground inline-flex shrink-0 items-center justify-start text-left focus-visible:ring-0 focus-visible:ring-offset-0",
    getMessageSectionChipButtonClassName({ isFilledChip }),
  );
  const chipContent = (
    <MessageSectionChipContent
      label={label}
      leadingSurface={leadingSurface}
      messageKind={messageKind}
      nodeId={nodeId}
      prefixIcon={prefixIcon}
      sectionId={sectionId}
      toneClassNames={toneClassNames}
    />
  );

  if (!interactive) {
    return (
      <div aria-hidden="true" className={chipClassName}>
        {chipContent}
      </div>
    );
  }

  return (
    <Button
      aria-expanded={!isCollapsed}
      aria-label={`Toggle ${nodeId} ${label} section`}
      className={chipClassName}
      variant="ghost"
      onClick={onToggleCollapse}
    >
      {chipContent}
    </Button>
  );
}
