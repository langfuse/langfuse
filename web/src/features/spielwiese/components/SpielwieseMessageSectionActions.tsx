import { ChevronDown, ChevronUp, CircleMinus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { getMessageToneClassNames } from "./spielwieseMessageTone";

function MessageSectionActionButton({
  ariaLabel,
  children,
  className,
  disabled = false,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  className: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={ariaLabel}
      className={className}
      disabled={disabled}
      size="icon-sm"
      variant="ghost"
      onClick={onClick}
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
  sectionLabel,
  sectionId,
}: SpielwieseMessageSectionActionsProps) {
  const toneClassNames = getMessageToneClassNames(sectionId);

  return (
    <div className="flex shrink-0 items-center opacity-0 transition-all group-focus-within:opacity-100 group-hover:opacity-100">
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
        onClick={onDelete}
      >
        <CircleMinus className="size-3.5" />
      </MessageSectionActionButton>
    </div>
  );
}
