"use client";

import { Archive, Eye, EyeOff, Maximize2, Minimize2 } from "lucide-react";
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
  onArchiveNode: () => void;
  onPreviewHoverEnd: () => void;
  onPreviewHoverStart: () => void;
  onTogglePreviewFocus: () => void;
  onToggleCompact: () => void;
};

export const spielwieseHeaderActionButtonClassName = `${spielwieseHeaderButtonBaseClassName} inline-flex size-7 shrink-0 items-center justify-center rounded-[10px] p-0`;

type SpielwieseNodeActionButtonsProps = {
  archiveButtonLabel?: string;
  compactButtonLabel?: string;
  containerTestId?: string;
  isCompact: boolean;
  isPreviewFocused: boolean;
  onArchiveNode: () => void;
  onPreviewHoverEnd?: () => void;
  onPreviewHoverStart?: () => void;
  onTogglePreviewFocus?: () => void;
  onToggleCompact: () => void;
  previewButtonLabel?: string;
};

export function SpielwieseNodeActionButtons({
  archiveButtonLabel = "Archive node",
  compactButtonLabel = "Toggle compact state",
  containerTestId,
  isCompact,
  isPreviewFocused,
  onArchiveNode,
  onPreviewHoverEnd: _onPreviewHoverEnd = () => {},
  onPreviewHoverStart: _onPreviewHoverStart = () => {},
  onTogglePreviewFocus = () => {},
  onToggleCompact,
  previewButtonLabel = "Preview node",
}: SpielwieseNodeActionButtonsProps) {
  const HeaderToggleIcon = isCompact ? Maximize2 : Minimize2;
  const PreviewToggleIcon = isPreviewFocused ? EyeOff : Eye;

  return (
    <div
      className="flex shrink-0 items-center gap-1"
      data-testid={containerTestId}
    >
      <Button
        aria-label={compactButtonLabel}
        aria-pressed={isCompact}
        className={spielwieseHeaderActionButtonClassName}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={onToggleCompact}
      >
        <HeaderToggleIcon className="size-3.5" />
      </Button>
      <Button
        aria-label={previewButtonLabel}
        aria-pressed={isPreviewFocused}
        className={cn(
          spielwieseHeaderActionButtonClassName,
          isPreviewFocused && spielwieseHeaderButtonAccentClassName,
        )}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={onTogglePreviewFocus}
      >
        <PreviewToggleIcon className="size-3.5" />
      </Button>
      <Button
        aria-label={archiveButtonLabel}
        className={spielwieseHeaderActionButtonClassName}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={onArchiveNode}
      >
        <Archive className="size-3.5" />
      </Button>
    </div>
  );
}

export function SpielwieseAgentNodeHeaderActions({
  isCompact,
  isPreviewFocused,
  nodeId,
  onArchiveNode,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onTogglePreviewFocus,
  onToggleCompact,
}: SpielwieseAgentNodeHeaderActionsProps) {
  const headerToggleLabel = `${
    isCompact ? "Maximize" : "Minimize"
  } ${nodeId} node sections`;
  const previewToggleLabel = isPreviewFocused
    ? `Close ${nodeId} focus mode`
    : `Preview ${nodeId} node`;

  return (
    <SpielwieseNodeActionButtons
      archiveButtonLabel={`Archive ${nodeId} node`}
      compactButtonLabel={headerToggleLabel}
      containerTestId="spielwiese-agent-node-header-actions"
      isCompact={isCompact}
      isPreviewFocused={isPreviewFocused}
      onArchiveNode={onArchiveNode}
      onPreviewHoverEnd={onPreviewHoverEnd}
      onPreviewHoverStart={onPreviewHoverStart}
      onToggleCompact={onToggleCompact}
      onTogglePreviewFocus={onTogglePreviewFocus}
      previewButtonLabel={previewToggleLabel}
    />
  );
}
