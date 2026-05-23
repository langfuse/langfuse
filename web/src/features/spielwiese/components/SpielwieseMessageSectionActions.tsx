import { ChevronDown, ChevronUp, CircleMinus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { getMessageToneClassNames } from "./spielwieseMessageTone";

const messageSectionInertActionClassName = "pointer-events-none cursor-default";

function MessageSectionActionButton({
  ariaLabel,
  children,
  className,
  disabled = false,
  isInert = false,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  className: string;
  disabled?: boolean;
  isInert?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      aria-disabled={isInert ? true : undefined}
      aria-label={ariaLabel}
      className={`${className} ${isInert ? messageSectionInertActionClassName : ""}`}
      disabled={disabled}
      size="icon-sm"
      tabIndex={isInert ? -1 : undefined}
      variant="ghost"
      onClick={isInert ? undefined : onClick}
    >
      {children}
    </Button>
  );
}

type SpielwieseMessageSectionActionsProps = {
  canMoveDown: boolean;
  canMoveUp: boolean;
  nodeId: string;
  onDelete: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  revealMode?: "agent-node" | "section";
  sectionLabel: string;
  sectionId: string;
};

export function SpielwieseMessageSectionActions({
  canMoveDown,
  canMoveUp,
  nodeId,
  onDelete,
  onMoveDown,
  onMoveUp,
  revealMode = "section",
  sectionLabel,
  sectionId,
}: SpielwieseMessageSectionActionsProps) {
  const toneClassNames = getMessageToneClassNames(sectionId);
  const revealClassName =
    revealMode === "agent-node"
      ? "pointer-events-none opacity-0 transition-all group-focus-within/agent-node:pointer-events-auto group-focus-within/agent-node:opacity-100 group-hover/agent-node:pointer-events-auto group-hover/agent-node:opacity-100"
      : "pointer-events-none opacity-0 transition-all group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100";

  return (
    <div className={`flex shrink-0 items-center ${revealClassName}`}>
      <MessageSectionActionButton
        ariaLabel={`Move ${nodeId} ${sectionLabel} message up`}
        className={toneClassNames.action}
        disabled={!canMoveUp}
        onClick={onMoveUp}
      >
        <ChevronUp className="size-3.5" />
      </MessageSectionActionButton>
      <MessageSectionActionButton
        ariaLabel={`Move ${nodeId} ${sectionLabel} message down`}
        className={toneClassNames.action}
        disabled={!canMoveDown}
        onClick={onMoveDown}
      >
        <ChevronDown className="size-3.5" />
      </MessageSectionActionButton>
      <MessageSectionActionButton
        ariaLabel={`Delete ${nodeId} ${sectionLabel} message`}
        className={toneClassNames.action}
        isInert
        onClick={onDelete}
      >
        <CircleMinus className="size-3.5" />
      </MessageSectionActionButton>
    </div>
  );
}
