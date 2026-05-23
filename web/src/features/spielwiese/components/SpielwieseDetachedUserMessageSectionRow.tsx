/* eslint-disable max-lines */
import { useState, type ReactNode } from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { spielwieseDetachedUserShellSurfaceStyle } from "./spielwieseAgentNodeColorPalette";
import { SpielwieseCollapsedPromptPreview } from "./SpielwieseCollapsedPromptPreview";
import { SpielwieseNodeActionButtons } from "./SpielwieseAgentNodeHeaderActions";
import { SpielwieseDetachedUserInlineAccessories } from "./SpielwieseDetachedUserInlineAccessories";
import { MessageSectionChipButton } from "./SpielwieseMessageSectionChip";
import { SpielwieseMustacheTextarea } from "./SpielwieseMustacheTextarea";
import {
  SpielwieseEmbeddedPromptFrame,
  spielwieseEmbeddedPromptInnerRadiusClassName,
  spielwieseEmbeddedSingleLineTextareaClassName,
} from "./SpielwieseMessageSectionBody";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";

function getMessageSectionRowRadiusClassName(sectionId: string) {
  return getMessageKind(sectionId) === "user"
    ? "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]"
    : "rounded-xl";
}

type SpielwieseDetachedUserMessageSectionRowProps = {
  canMoveDown: boolean;
  canMoveUp: boolean;
  displayLabel: string;
  isCompact?: boolean;
  isPreviewFocused?: boolean;
  nodeId: string;
  onAgentNodeArchive?: (nodeId: string) => void;
  onPreviewHoverEnd?: () => void;
  onPreviewHoverStart?: () => void;
  onPromptSectionChange: (
    nodeId: string,
    sectionId: string,
    value: string,
  ) => void;
  onPromptSectionDelete: (nodeId: string, sectionId: string) => void;
  onPromptSectionMove: (
    nodeId: string,
    sectionId: string,
    direction: "up" | "down",
  ) => void;
  onToggleCompact?: () => void;
  onTogglePreviewFocus?: () => void;
  section: SpielwieseAgentNodeVM["promptSections"][number];
  startCollapsed?: boolean;
};

const detachedUserPromptLabel = "User message";

// The detached user shell intentionally mirrors the agent card anatomy in one place.
// eslint-disable-next-line max-lines-per-function
function DetachedUserInputShell({
  header,
  nodeId,
  onPromptSectionChange,
  section,
}: Pick<
  SpielwieseDetachedUserMessageSectionRowProps,
  "nodeId" | "onPromptSectionChange" | "section"
> & {
  header?: ReactNode;
}) {
  const toneClassNames = getMessageToneClassNames(section.id);

  return (
    <div
      className={cn("pt-0 pb-px text-base", toneClassNames.body)}
      data-testid="spielwiese-detached-user-content-frame"
    >
      <div
        className="border-border/40 bg-background/96 flex w-full min-w-0 flex-col rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] border pb-[4px]"
        style={spielwieseDetachedUserShellSurfaceStyle}
      >
        {header ? (
          <div
            className="pt-[6px] pr-[6px] pb-[6px] pl-[6px]"
            data-testid="spielwiese-detached-user-content-header"
          >
            {header}
          </div>
        ) : null}
        <div className="px-[5px]">
          <SpielwieseEmbeddedPromptFrame
            header={
              <DetachedUserEmbeddedHeader
                nodeId={nodeId}
                section={section}
                sectionLabel={detachedUserPromptLabel}
              />
            }
            promptShellTestId="spielwiese-detached-user-prompt-shell"
            shellTestId="spielwiese-detached-user-embedded-shell"
          >
            <label
              className="block min-w-0"
              data-testid="spielwiese-detached-user-input-shell"
            >
              <SpielwieseMustacheTextarea
                aria-label={`${nodeId} ${detachedUserPromptLabel}`}
                className={cn(
                  spielwieseEmbeddedSingleLineTextareaClassName,
                  toneClassNames.field,
                  "placeholder:text-foreground/36 bg-transparent px-3 py-1 shadow-none",
                )}
                liveInline
                name={`${nodeId}-${section.id}`}
                onChange={(event) =>
                  onPromptSectionChange(nodeId, section.id, event.target.value)
                }
                placeholder="Type the user's message"
                rootClassName={spielwieseEmbeddedPromptInnerRadiusClassName}
                rows={1}
                value={section.value}
              />
            </label>
          </SpielwieseEmbeddedPromptFrame>
        </div>
      </div>
    </div>
  );
}

function DetachedUserEmbeddedHeader({
  nodeId,
  section,
  sectionLabel,
}: {
  nodeId: string;
  section: SpielwieseAgentNodeVM["promptSections"][number];
  sectionLabel: string;
}) {
  const toneClassNames = getMessageToneClassNames(section.id);

  return (
    <div
      className="ml-[2px] flex w-full items-center justify-between gap-1.5 bg-transparent"
      data-testid="spielwiese-detached-user-embedded-header"
    >
      <div className="ml-[3px] flex min-w-0 flex-1 items-center gap-1.5 overflow-visible">
        <MessageSectionChipButton
          interactive={false}
          isCollapsed={false}
          label={sectionLabel}
          leadingSurface="embedded"
          messageKind="user"
          nodeId={nodeId}
          onToggleCollapse={() => {}}
          prefixIconTestId={`${nodeId}-user-message-chip-icon`}
          sectionId={section.id}
          toneClassNames={toneClassNames}
        />
      </div>
    </div>
  );
}

function DetachedUserHeaderLeading({
  isCollapsed,
  nodeId,
  section,
  sectionLabel,
}: {
  isCollapsed: boolean;
  nodeId: string;
  section: SpielwieseAgentNodeVM["promptSections"][number];
  sectionLabel: string;
}) {
  const toneClassNames = getMessageToneClassNames(section.id);

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1 overflow-visible"
      data-testid="spielwiese-detached-user-header-leading"
    >
      <MessageSectionChipButton
        interactive={false}
        isCollapsed={isCollapsed}
        label={sectionLabel}
        leadingSurface="plain"
        messageKind="user"
        nodeId={nodeId}
        onToggleCollapse={() => {}}
        prefixIcon={UserRound}
        prefixIconTestId={`${nodeId}-user-chip-icon`}
        sectionId={section.id}
        toneClassNames={toneClassNames}
      />
      <SpielwieseDetachedUserInlineAccessories />
      {isCollapsed ? (
        <SpielwieseCollapsedPromptPreview
          className={toneClassNames.count}
          value={section.value}
        />
      ) : null}
    </div>
  );
}

type DetachedUserHeaderStripProps = Pick<
  SpielwieseDetachedUserMessageSectionRowProps,
  | "isPreviewFocused"
  | "nodeId"
  | "onAgentNodeArchive"
  | "onPreviewHoverEnd"
  | "onPreviewHoverStart"
  | "onTogglePreviewFocus"
  | "section"
> & {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  sectionLabel: string;
};

function DetachedUserHeaderStrip({
  isCollapsed,
  isPreviewFocused = false,
  nodeId,
  onAgentNodeArchive,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onTogglePreviewFocus,
  onToggleCollapse,
  section,
  sectionLabel,
}: DetachedUserHeaderStripProps) {
  return (
    <div
      className="flex w-full items-center justify-between gap-3"
      data-testid="spielwiese-detached-user-header-strip"
    >
      <DetachedUserHeaderLeading
        isCollapsed={isCollapsed}
        nodeId={nodeId}
        section={section}
        sectionLabel={sectionLabel}
      />
      <SpielwieseNodeActionButtons
        archiveButtonLabel={`Archive ${nodeId} node`}
        compactButtonLabel={`${
          isCollapsed ? "Maximize" : "Minimize"
        } ${nodeId} ${sectionLabel} section`}
        isCompact={isCollapsed}
        isPreviewButtonDisabled
        isPreviewFocused={isPreviewFocused}
        onArchiveNode={() => onAgentNodeArchive?.(nodeId)}
        onPreviewHoverEnd={onPreviewHoverEnd}
        onPreviewHoverStart={onPreviewHoverStart}
        onToggleCompact={onToggleCollapse}
        onTogglePreviewFocus={onTogglePreviewFocus}
        previewButtonLabel={`Preview ${nodeId} node`}
      />
    </div>
  );
}

export function SpielwieseDetachedUserMessageSectionRow({
  displayLabel,
  isCompact,
  isPreviewFocused,
  nodeId,
  onAgentNodeArchive,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onPromptSectionChange,
  onTogglePreviewFocus,
  section,
  startCollapsed = false,
}: SpielwieseDetachedUserMessageSectionRowProps) {
  const [uncontrolledCollapsed, setUncontrolledCollapsed] =
    useState(startCollapsed);
  const isCollapsed = Boolean(isCompact || uncontrolledCollapsed);
  const toggleCollapsed = () =>
    setUncontrolledCollapsed((currentValue) => !currentValue);
  const sectionHeader = (
    <DetachedUserHeaderStrip
      isCollapsed={isCollapsed}
      isPreviewFocused={isPreviewFocused}
      nodeId={nodeId}
      onAgentNodeArchive={onAgentNodeArchive}
      onPreviewHoverEnd={onPreviewHoverEnd}
      onPreviewHoverStart={onPreviewHoverStart}
      onTogglePreviewFocus={onTogglePreviewFocus}
      onToggleCollapse={toggleCollapsed}
      section={section}
      sectionLabel={displayLabel}
    />
  );

  return (
    <div
      className={cn(
        "group flex w-full flex-col gap-0 overflow-visible pt-0",
        isCollapsed ? "pb-[2px]" : "pb-0",
        getMessageSectionRowRadiusClassName(section.id),
      )}
      data-section-id={section.id}
      data-testid="spielwiese-message-section-row"
    >
      {isCollapsed ? null : (
        <DetachedUserInputShell
          header={sectionHeader}
          nodeId={nodeId}
          onPromptSectionChange={onPromptSectionChange}
          section={section}
        />
      )}
      {isCollapsed ? sectionHeader : null}
    </div>
  );
}
