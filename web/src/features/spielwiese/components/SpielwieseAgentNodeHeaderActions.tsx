"use client";

import {
  Archive,
  Focus,
  PanelTopClose,
  PanelTopOpen,
  Shrink,
} from "lucide-react";
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

function getHeaderToggleIcon(isCompact: boolean) {
  return isCompact ? PanelTopOpen : PanelTopClose;
}

function getPreviewToggleIcon(isPreviewFocused: boolean) {
  return isPreviewFocused ? Shrink : Focus;
}

function getPreviewButtonClassName({
  isPreviewButtonDisabled,
  isPreviewFocused,
}: {
  isPreviewButtonDisabled: boolean;
  isPreviewFocused: boolean;
}) {
  return cn(
    spielwieseHeaderActionButtonClassName,
    isPreviewButtonDisabled && "disabled:opacity-100",
    isPreviewFocused && spielwieseHeaderButtonAccentClassName,
  );
}

type SpielwieseNodeActionButtonsProps = {
  archiveButtonLabel?: string;
  compactButtonLabel?: string;
  containerTestId?: string;
  isCompact: boolean;
  isPreviewButtonDisabled?: boolean;
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
  isPreviewButtonDisabled = false,
  isPreviewFocused,
  onArchiveNode,
  onPreviewHoverEnd: _onPreviewHoverEnd = () => {},
  onPreviewHoverStart: _onPreviewHoverStart = () => {},
  onTogglePreviewFocus = () => {},
  onToggleCompact,
  previewButtonLabel = "Preview node",
}: SpielwieseNodeActionButtonsProps) {
  const HeaderToggleIcon = getHeaderToggleIcon(isCompact);
  const PreviewToggleIcon = getPreviewToggleIcon(isPreviewFocused);

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
        <HeaderToggleIcon className="size-4 stroke-[2.1px]" />
      </Button>
      <Button
        aria-label={previewButtonLabel}
        aria-pressed={isPreviewFocused}
        className={getPreviewButtonClassName({
          isPreviewButtonDisabled,
          isPreviewFocused,
        })}
        disabled={isPreviewButtonDisabled}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={onTogglePreviewFocus}
      >
        <PreviewToggleIcon className="size-4 stroke-[2.1px]" />
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
      isPreviewButtonDisabled
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
