import type { ReactNode } from "react";
import { useState } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { cn } from "@/src/utils/tailwind";
import {
  SpielwieseMessageSectionBody,
  spielwieseInlineTextareaClassName,
} from "./SpielwieseMessageSectionBody";
import { SpielwieseMessageSectionHeader } from "./SpielwieseMessageSectionHeader";
import { SpielwieseMustacheTextarea } from "./SpielwieseMustacheTextarea";
import type { SpielwieseToolOption } from "./SpielwieseToolMessageSection";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";

type SpielwieseStandardMessageSectionRowProps = {
  canMoveDown: boolean;
  canMoveUp: boolean;
  defaultCollapsed?: boolean;
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
  rowTopPadding?: "default" | "none";
  section: SpielwieseAgentNodeVM["promptSections"][number];
  toolOptions: SpielwieseToolOption[];
};

function getMessageSectionRowRadiusClassName(sectionId: string) {
  return getMessageKind(sectionId) === "user"
    ? "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]"
    : "rounded-xl";
}

function getMessageSectionRowPaddingClassName(sectionId: string) {
  return getMessageKind(sectionId) === "system" ? "px-[5px]" : "px-2.5";
}

function getMessageSectionRowBottomPaddingClassName(sectionId: string) {
  return getMessageKind(sectionId) === "system" ? "pb-0" : "pb-2";
}

function getMessageSectionRowTopPaddingClassName({
  rowTopPadding,
}: Pick<SpielwieseStandardMessageSectionRowProps, "rowTopPadding">) {
  return rowTopPadding === "none" ? "pt-0" : "pt-1";
}

function renderExpandedStandardMessageSectionContent({
  header,
  nodeId,
  onPromptSectionChange,
  section,
  toolOptions,
}: Pick<
  SpielwieseStandardMessageSectionRowProps,
  "nodeId" | "onPromptSectionChange" | "section" | "toolOptions"
> & {
  header?: ReactNode;
}) {
  const toneClassNames = getMessageToneClassNames(section.id);

  if (getMessageKind(section.id) === "user") {
    return (
      <SpielwieseMustacheTextarea
        aria-label={`${nodeId} ${section.label}`}
        className={cn(
          `${spielwieseInlineTextareaClassName} [field-sizing:content] min-h-6 w-full overflow-hidden px-0 pt-1 pb-0.5 text-base leading-7 sm:text-[0.9375rem]`,
          toneClassNames.field,
        )}
        name={`${nodeId}-${section.id}`}
        onChange={(event) =>
          onPromptSectionChange(nodeId, section.id, event.target.value)
        }
        rows={1}
        value={section.value}
      />
    );
  }

  return (
    <SpielwieseMessageSectionBody
      header={header}
      nodeId={nodeId}
      onPromptSectionChange={onPromptSectionChange}
      section={section}
      toolOptions={toolOptions}
    />
  );
}

export function SpielwieseStandardMessageSectionRow({
  canMoveDown,
  canMoveUp,
  defaultCollapsed = false,
  displayLabel,
  nodeId,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionMove,
  rowTopPadding = "default",
  section,
  toolOptions,
}: SpielwieseStandardMessageSectionRowProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const toneClassNames = getMessageToneClassNames(section.id);
  const shouldEmbedHeader =
    !isCollapsed && getMessageKind(section.id) !== "tool";
  const sectionHeader = (
    <SpielwieseMessageSectionHeader
      canMoveDown={canMoveDown}
      canMoveUp={canMoveUp}
      isCollapsed={isCollapsed}
      label={displayLabel}
      leadingSurface={shouldEmbedHeader ? "embedded" : "plain"}
      nodeId={nodeId}
      onDelete={() => onPromptSectionDelete(nodeId, section.id)}
      onMoveDown={() => onPromptSectionMove(nodeId, section.id, "down")}
      onMoveUp={() => onPromptSectionMove(nodeId, section.id, "up")}
      onToggleCollapse={() => setIsCollapsed((currentValue) => !currentValue)}
      sectionId={section.id}
      value={section.value}
    />
  );

  return (
    <div
      className={cn(
        "group flex w-full flex-col overflow-hidden",
        getMessageSectionRowBottomPaddingClassName(section.id),
        getMessageSectionRowTopPaddingClassName({ rowTopPadding }),
        getMessageSectionRowPaddingClassName(section.id),
        getMessageSectionRowRadiusClassName(section.id),
        toneClassNames.surface,
      )}
      data-section-id={section.id}
      data-testid="spielwiese-message-section-row"
    >
      {shouldEmbedHeader ? null : sectionHeader}
      {isCollapsed
        ? null
        : renderExpandedStandardMessageSectionContent({
            header: shouldEmbedHeader ? sectionHeader : undefined,
            nodeId,
            onPromptSectionChange,
            section,
            toolOptions,
          })}
    </div>
  );
}
