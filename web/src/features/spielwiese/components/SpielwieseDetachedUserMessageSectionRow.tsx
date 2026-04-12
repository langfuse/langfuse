/* eslint-disable max-lines */
import { useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Button } from "../ui/button";
import { SpielwieseCollapsedPromptPreview } from "./SpielwieseCollapsedPromptPreview";
import { SpielwieseDetachedUserInlineAccessories } from "./SpielwieseDetachedUserInlineAccessories";
import { MessageSectionChipButton } from "./SpielwieseMessageSectionChip";
import { SpielwieseMustacheTextarea } from "./SpielwieseMustacheTextarea";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";
import { SpielwieseMessageSectionTrailing } from "./SpielwieseMessageSectionHeaderSupport";
import {
  spielwieseEmbeddedPromptInnerRadiusClassName,
  spielwieseEmbeddedPromptRadiusClassName,
  spielwieseEmbeddedPromptRadiusVariablesClassName,
  spielwieseEmbeddedSingleLineTextareaClassName,
} from "./SpielwieseMessageSectionBody";

function getMessageSectionRowRadiusClassName(sectionId: string) {
  return getMessageKind(sectionId) === "user"
    ? "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]"
    : "rounded-xl";
}

type SpielwieseDetachedUserMessageSectionRowProps = {
  canMoveDown: boolean;
  canMoveUp: boolean;
  displayLabel: string;
  nodeId: string;
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
      className={cn(
        toneClassNames.body,
        "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] border border-[rgba(0,0,0,0.04)] bg-[#FBFBFB] p-0",
      )}
      data-testid="spielwiese-detached-user-content-frame"
    >
      {header ? (
        <div className="px-[2px] pt-[2px] pb-[3px]">{header}</div>
      ) : null}
      <div
        className={cn(
          "flex min-h-0 w-full min-w-0 flex-col items-stretch gap-px overflow-hidden border border-[rgba(0,0,0,0.05)] bg-[#F1F2F2] px-[2px] pt-0 pb-[2px] shadow-none",
          spielwieseEmbeddedPromptRadiusVariablesClassName,
          spielwieseEmbeddedPromptRadiusClassName,
        )}
        data-testid="spielwiese-detached-user-embedded-shell"
      >
        <div className="pt-px pb-px">
          <DetachedUserEmbeddedHeader
            nodeId={nodeId}
            section={section}
            sectionLabel={detachedUserPromptLabel}
          />
        </div>
        <label
          className="block min-w-0"
          data-testid="spielwiese-detached-user-input-shell"
        >
          <div
            className={cn(
              "flex min-h-0 w-full min-w-0 flex-col items-stretch overflow-hidden bg-[#FBFBFB] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
              spielwieseEmbeddedPromptInnerRadiusClassName,
            )}
            data-testid="spielwiese-detached-user-prompt-shell"
          >
            <SpielwieseMustacheTextarea
              aria-label={`${nodeId} ${detachedUserPromptLabel}`}
              className={cn(
                spielwieseEmbeddedSingleLineTextareaClassName,
                toneClassNames.field,
                "placeholder:text-foreground/36 bg-transparent px-4 py-[0.4375rem] shadow-none",
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
          </div>
        </label>
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
      className="ml-[2px] flex w-full items-center justify-between gap-3 bg-transparent"
      data-testid="spielwiese-detached-user-embedded-header"
    >
      <div className="ml-[3px] flex min-w-0 flex-1 items-center gap-2 overflow-visible">
        <MessageSectionChipButton
          interactive={false}
          isCollapsed={false}
          label={sectionLabel}
          leadingSurface="embedded"
          messageKind="user"
          nodeId={nodeId}
          onToggleCollapse={() => {}}
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
  onToggleCollapse,
  section,
  sectionLabel,
}: {
  isCollapsed: boolean;
  nodeId: string;
  onToggleCollapse: () => void;
  section: SpielwieseAgentNodeVM["promptSections"][number];
  sectionLabel: string;
}) {
  const toneClassNames = getMessageToneClassNames(section.id);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-visible">
      <MessageSectionChipButton
        isCollapsed={isCollapsed}
        label={sectionLabel}
        leadingSurface="plain"
        messageKind="user"
        nodeId={nodeId}
        onToggleCollapse={onToggleCollapse}
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
  "canMoveDown" | "canMoveUp" | "nodeId" | "section"
> & {
  isCollapsed: boolean;
  onPromptSectionDelete: (nodeId: string, sectionId: string) => void;
  onPromptSectionMove: (
    nodeId: string,
    sectionId: string,
    direction: "up" | "down",
  ) => void;
  onToggleCollapse: () => void;
  sectionLabel: string;
};

function DetachedUserHeaderStrip({
  canMoveDown,
  canMoveUp,
  isCollapsed,
  nodeId,
  onPromptSectionDelete,
  onPromptSectionMove,
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
        onToggleCollapse={onToggleCollapse}
        section={section}
        sectionLabel={sectionLabel}
      />
      <SpielwieseMessageSectionTrailing
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        controlRevealMode="section"
        label={sectionLabel}
        nodeId={nodeId}
        onDelete={() => onPromptSectionDelete(nodeId, section.id)}
        onMoveDown={() => onPromptSectionMove(nodeId, section.id, "down")}
        onMoveUp={() => onPromptSectionMove(nodeId, section.id, "up")}
        sectionId={section.id}
        trailingAccessory={
          <DetachedUserCompactToggleButton
            isCollapsed={isCollapsed}
            nodeId={nodeId}
            onToggleCollapse={onToggleCollapse}
            sectionLabel={sectionLabel}
          />
        }
      />
    </div>
  );
}

function DetachedUserCompactToggleButton({
  isCollapsed,
  nodeId,
  onToggleCollapse,
  sectionLabel,
}: {
  isCollapsed: boolean;
  nodeId: string;
  onToggleCollapse: () => void;
  sectionLabel: string;
}) {
  const ToggleIcon = isCollapsed ? Maximize2 : Minimize2;
  const compactToggleLabel = `${
    isCollapsed ? "Maximize" : "Minimize"
  } ${nodeId} ${sectionLabel} section`;

  return (
    <Button
      aria-label={compactToggleLabel}
      aria-pressed={isCollapsed}
      className="bg-background text-foreground/58 hover:bg-background hover:text-foreground h-7 w-7 shrink-0 rounded-[8px] border border-[rgba(0,0,0,0.08)]"
      size="icon-sm"
      variant="ghost"
      onClick={onToggleCollapse}
    >
      <ToggleIcon className="size-3.5" />
    </Button>
  );
}

export function SpielwieseDetachedUserMessageSectionRow({
  canMoveDown,
  canMoveUp,
  displayLabel,
  nodeId,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionMove,
  section,
  startCollapsed = false,
}: SpielwieseDetachedUserMessageSectionRowProps) {
  const [isCollapsed, setIsCollapsed] = useState(startCollapsed);
  const toggleCollapsed = () => setIsCollapsed((currentValue) => !currentValue);
  const sectionHeader = (
    <DetachedUserHeaderStrip
      canMoveDown={canMoveDown}
      canMoveUp={canMoveUp}
      isCollapsed={isCollapsed}
      nodeId={nodeId}
      onPromptSectionDelete={onPromptSectionDelete}
      onPromptSectionMove={onPromptSectionMove}
      onToggleCollapse={toggleCollapsed}
      section={section}
      sectionLabel={displayLabel}
    />
  );

  return (
    <div
      className={cn(
        "group flex w-full flex-col gap-1 overflow-visible px-[2px] pt-[2px] pb-[2px]",
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
