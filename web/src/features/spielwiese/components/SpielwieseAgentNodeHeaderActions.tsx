"use client";

import { Eye, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import {
  spielwieseHeaderButtonAccentClassName,
  spielwieseHeaderButtonBaseClassName,
} from "./spielwieseHeaderButtonStyles";

type SpielwieseAgentNodeHeaderActionsProps = {
  isCompact: boolean;
  isPreviewFocused: boolean;
  nodeId: string;
  onPreviewHoverEnd: () => void;
  onPreviewHoverStart: () => void;
  onTogglePreviewFocus: () => void;
  onToggleCompact: () => void;
};

const headerActionButtonClassName = `${spielwieseHeaderButtonBaseClassName} inline-flex size-7 shrink-0 items-center justify-center rounded-[10px] p-0`;

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
      className="flex shrink-0 items-center gap-1"
      data-testid="spielwiese-agent-node-header-actions"
    >
      <Button
        aria-label={headerToggleLabel}
        aria-pressed={isCompact}
        className={headerActionButtonClassName}
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
        className={cn(
          headerActionButtonClassName,
          isPreviewFocused && spielwieseHeaderButtonAccentClassName,
        )}
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
