"use client";

import {
  Archive,
  Focus,
  type LucideIcon,
  PanelTopClose,
  PanelTopOpen,
  Shrink,
} from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import {
  spielwieseHeaderButtonAccentClassName,
  spielwieseHeaderButtonBaseClassName,
  spielwieseHeaderButtonInertClassName,
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

function getActionButtonInteractionProps({
  isInert,
  onClick,
}: {
  isInert: boolean;
  onClick: () => void;
}) {
  return {
    "aria-disabled": isInert ? true : undefined,
    onClick: isInert ? undefined : onClick,
    tabIndex: isInert ? -1 : undefined,
  };
}

type HeaderActionButtonProps = {
  ariaLabel: string;
  ariaPressed?: boolean;
  className?: string;
  disabled?: boolean;
  iconClassName: string;
  Icon: LucideIcon;
  isInert?: boolean;
  onClick: () => void;
};

function HeaderActionButton({
  ariaLabel,
  ariaPressed,
  className,
  disabled = false,
  iconClassName,
  Icon,
  isInert = false,
  onClick,
}: HeaderActionButtonProps) {
  return (
    <Button
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={cn(
        spielwieseHeaderActionButtonClassName,
        isInert && spielwieseHeaderButtonInertClassName,
        className,
      )}
      disabled={disabled}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...getActionButtonInteractionProps({ isInert, onClick })}
    >
      <Icon className={iconClassName} />
    </Button>
  );
}

type SpielwieseNodeActionButtonsProps = {
  archiveButtonLabel?: string;
  compactButtonLabel?: string;
  compactButtonIsInert?: boolean;
  containerTestId?: string;
  isCompact: boolean;
  isPreviewButtonDisabled?: boolean;
  isPreviewButtonInert?: boolean;
  isPreviewFocused: boolean;
  onArchiveNode: () => void;
  onPreviewHoverEnd?: () => void;
  onPreviewHoverStart?: () => void;
  onTogglePreviewFocus?: () => void;
  onToggleCompact: () => void;
  previewButtonLabel?: string;
};

// eslint-disable-next-line complexity
export function SpielwieseNodeActionButtons({
  archiveButtonLabel = "Archive node",
  compactButtonLabel = "Toggle compact state",
  compactButtonIsInert = false,
  containerTestId,
  isCompact,
  isPreviewButtonDisabled = false,
  isPreviewButtonInert = false,
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
      <HeaderActionButton
        ariaLabel={compactButtonLabel}
        ariaPressed={isCompact}
        iconClassName="size-4 stroke-[2.1px]"
        Icon={HeaderToggleIcon}
        isInert={compactButtonIsInert}
        onClick={onToggleCompact}
      />
      <HeaderActionButton
        ariaLabel={previewButtonLabel}
        ariaPressed={isPreviewFocused}
        className={cn(
          (isPreviewButtonDisabled || isPreviewButtonInert) &&
            "disabled:opacity-100",
          isPreviewFocused && spielwieseHeaderButtonAccentClassName,
        )}
        disabled={isPreviewButtonDisabled}
        iconClassName="size-4 stroke-[2.1px]"
        Icon={PreviewToggleIcon}
        isInert={isPreviewButtonInert}
        onClick={onTogglePreviewFocus}
      />
      <HeaderActionButton
        ariaLabel={archiveButtonLabel}
        iconClassName="size-3.5"
        Icon={Archive}
        isInert
        onClick={onArchiveNode}
      />
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
