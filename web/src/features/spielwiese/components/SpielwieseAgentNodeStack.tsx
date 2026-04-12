import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import {
  SpielwieseAgentNodePreviewSpotlight,
  useSpielwieseAgentNodeFocusMode,
} from "./SpielwieseAgentNodeFocusMode";
import { SpielwieseFocusedAgentNodeModal } from "./SpielwieseFocusedAgentNodeModal";
import { SpielwieseAgentNodeItem } from "./SpielwieseAgentNodeItem";

type SpielwieseAgentNodeStackProps = {
  listClassName?: string;
  nodes: SpielwieseAgentNodeVM[];
  onAgentNodeInsert: (nodeId: string, kind: "user" | "agent") => void;
  onPromptSectionDelete: (nodeId: string, sectionId: string) => void;
  onPromptSectionInsert: (
    nodeId: string,
    kind: "user" | "system" | "assistant" | "tool",
  ) => void;
  onPromptSectionChange: (
    nodeId: string,
    sectionId: string,
    value: string,
  ) => void;
  onPromptSectionMove: (
    nodeId: string,
    sectionId: string,
    direction: "up" | "down",
  ) => void;
  onSettingValueChange: (
    nodeId: string,
    settingId: string,
    value: string,
  ) => void;
  onTitleChange: (nodeId: string, value: string) => void;
};

type SpielwieseAgentNodeListProps = {
  listClassName?: string;
  compactNodeIds: Record<string, boolean>;
  focusMode: ReturnType<typeof useSpielwieseAgentNodeFocusMode>;
  nodes: SpielwieseAgentNodeVM[];
  onAgentNodeInsert: SpielwieseAgentNodeStackProps["onAgentNodeInsert"];
  onPromptSectionChange: SpielwieseAgentNodeStackProps["onPromptSectionChange"];
  onPromptSectionDelete: SpielwieseAgentNodeStackProps["onPromptSectionDelete"];
  onPromptSectionInsert: SpielwieseAgentNodeStackProps["onPromptSectionInsert"];
  onPromptSectionMove: SpielwieseAgentNodeStackProps["onPromptSectionMove"];
  onSettingValueChange: SpielwieseAgentNodeStackProps["onSettingValueChange"];
  onTitleChange: SpielwieseAgentNodeStackProps["onTitleChange"];
  onToggleCompact: (nodeId: string) => void;
};

function renderAgentNodeItems({
  compactNodeIds,
  focusMode,
  nodes,
  onAgentNodeInsert,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
  onToggleCompact,
}: Omit<SpielwieseAgentNodeListProps, "listClassName">) {
  return nodes.map((node) => (
    <SpielwieseAgentNodeItem
      isCompact={Boolean(compactNodeIds[node.id])}
      isPreviewFocused={focusMode.focusedNodeId === node.id}
      isPreviewFocusHidden={focusMode.focusedNodeId === node.id}
      isPreviewSpotlighted={focusMode.hoveredPreviewNodeId === node.id}
      key={node.id}
      node={node}
      onAgentNodeInsert={onAgentNodeInsert}
      onPreviewHoverEnd={() => focusMode.handlePreviewHoverEnd(node.id)}
      onPreviewHoverStart={() => focusMode.handlePreviewHoverStart(node.id)}
      onPromptSectionChange={onPromptSectionChange}
      onPromptSectionDelete={onPromptSectionDelete}
      onPromptSectionInsert={onPromptSectionInsert}
      onPromptSectionMove={onPromptSectionMove}
      onRegisterPreviewRegion={focusMode.getPreviewRegionRef(node.id)}
      onSettingValueChange={onSettingValueChange}
      onTitleChange={onTitleChange}
      onToggleCompact={() => onToggleCompact(node.id)}
      onTogglePreviewFocus={() => focusMode.togglePreviewFocus(node.id)}
    />
  ));
}

function SpielwieseAgentNodeList({
  listClassName,
  compactNodeIds,
  focusMode,
  nodes,
  onAgentNodeInsert,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
  onToggleCompact,
}: SpielwieseAgentNodeListProps) {
  return (
    <ol
      className={cn(
        "relative isolate flex min-h-full flex-col gap-1.5 pt-4 pb-2 sm:pt-5",
        listClassName,
      )}
      data-testid="spielwiese-agent-node-stack"
      role="list"
    >
      {renderAgentNodeItems({
        compactNodeIds,
        focusMode,
        nodes,
        onAgentNodeInsert,
        onPromptSectionChange,
        onPromptSectionDelete,
        onPromptSectionInsert,
        onPromptSectionMove,
        onSettingValueChange,
        onTitleChange,
        onToggleCompact,
      })}
    </ol>
  );
}

export function SpielwieseAgentNodeStack({
  listClassName,
  nodes,
  onAgentNodeInsert,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseAgentNodeStackProps) {
  const [compactNodeIds, setCompactNodeIds] = useState<Record<string, boolean>>(
    {},
  );
  const focusMode = useSpielwieseAgentNodeFocusMode(nodes);
  const toggleCompact = (nodeId: string) => {
    setCompactNodeIds((currentIds) => ({
      ...currentIds,
      [nodeId]: !currentIds[nodeId],
    }));
  };

  return (
    <>
      <SpielwieseAgentNodeList
        listClassName={listClassName}
        compactNodeIds={compactNodeIds}
        focusMode={focusMode}
        nodes={nodes}
        onAgentNodeInsert={onAgentNodeInsert}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        onSettingValueChange={onSettingValueChange}
        onTitleChange={onTitleChange}
        onToggleCompact={toggleCompact}
      />
      <SpielwieseAgentNodePreviewSpotlight
        frame={focusMode.activePreviewSpotlightFrame}
      />
      <SpielwieseFocusedAgentNodeModal
        compactNodeIds={compactNodeIds}
        focusMode={focusMode}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        onSettingValueChange={onSettingValueChange}
        onTitleChange={onTitleChange}
        onToggleCompact={toggleCompact}
      />
    </>
  );
}
