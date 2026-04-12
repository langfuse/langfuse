"use client";

import { Eye, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "../ui/button";

type SpielwieseAgentNodeHeaderActionsProps = {
  isCompact: boolean;
  isPreviewFocused: boolean;
  nodeId: string;
  onPreviewHoverEnd: () => void;
  onPreviewHoverStart: () => void;
  onTogglePreviewFocus: () => void;
  onToggleCompact: () => void;
};

const headerActionButtonClassName =
  "text-foreground/58 hover:text-foreground flex h-full shrink-0 items-center justify-center rounded-none bg-transparent";

export function SpielwieseAgentNodeHeaderActions({
  isCompact,
  isPreviewFocused,
  nodeId,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onTogglePreviewFocus,
  onToggleCompact,
}: SpielwieseAgentNodeHeaderActionsProps) {
  const HeaderToggleIcon = isCompact ? Maximize2 : Minimize2;
  const headerToggleLabel = `${
    isCompact ? "Maximize" : "Minimize"
  } ${nodeId} node sections`;

  return (
    <div
      className="bg-background flex h-7 shrink-0 items-center overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)]"
      data-testid="spielwiese-agent-node-header-actions"
    >
      <Button
        aria-label={headerToggleLabel}
        aria-pressed={isCompact}
        className={`${headerActionButtonClassName} hover:bg-background w-7`}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={onToggleCompact}
      >
        <HeaderToggleIcon className="size-3.5" />
      </Button>
      <Button
        aria-label={`Preview ${nodeId} node`}
        aria-pressed={isPreviewFocused}
        className={`${headerActionButtonClassName} w-7 border-l border-[rgba(0,0,0,0.05)] hover:bg-[rgba(0,0,0,0.03)] ${
          isPreviewFocused
            ? "bg-[rgba(201,120,62,0.12)] text-[#6F4124]"
            : "bg-[rgba(0,0,0,0.02)]"
        }`}
        size="icon-sm"
        type="button"
        variant="ghost"
        onBlur={onPreviewHoverEnd}
        onClick={onTogglePreviewFocus}
        onFocus={onPreviewHoverStart}
        onMouseEnter={onPreviewHoverStart}
        onMouseLeave={onPreviewHoverEnd}
        onPointerEnter={onPreviewHoverStart}
        onPointerLeave={onPreviewHoverEnd}
      >
        <Eye className="size-3.5" />
      </Button>
    </div>
  );
}
