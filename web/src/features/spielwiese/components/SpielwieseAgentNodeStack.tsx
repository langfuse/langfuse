import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import {
  SpielwieseAgentNodePreviewSpotlight,
  useSpielwieseAgentNodeFocusMode,
} from "./SpielwieseAgentNodeFocusMode";
import { SpielwieseFocusedAgentNodeModal } from "./SpielwieseFocusedAgentNodeModal";
import { SpielwieseAgentNodeItem } from "./SpielwieseAgentNodeItem";

type SpielwieseAgentNodeStackProps = {
  compactNodeIds: Record<string, boolean>;
  listClassName?: string;
  nodes: SpielwieseAgentNodeVM[];
  onAgentNodeArchive: (nodeId: string) => void;
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
  onToggleCompact: (nodeId: string) => void;
  onTitleChange: (nodeId: string, value: string) => void;
};

type SpielwieseAgentNodeListProps = {
  listClassName?: string;
  compactNodeIds: Record<string, boolean>;
  focusMode: ReturnType<typeof useSpielwieseAgentNodeFocusMode>;
  nodes: SpielwieseAgentNodeVM[];
  onAgentNodeArchive: SpielwieseAgentNodeStackProps["onAgentNodeArchive"];
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
  onAgentNodeArchive,
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
      key={`${node.id}-${compactNodeIds[node.id] ? "compact" : "expanded"}`}
      node={node}
      onAgentNodeArchive={onAgentNodeArchive}
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
  onAgentNodeArchive,
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
        onAgentNodeArchive,
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
  compactNodeIds,
  listClassName,
  nodes,
  onAgentNodeArchive,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onToggleCompact,
  onTitleChange,
}: SpielwieseAgentNodeStackProps) {
  const focusMode = useSpielwieseAgentNodeFocusMode(nodes);

  return (
    <>
      <SpielwieseAgentNodeList
        listClassName={listClassName}
        compactNodeIds={compactNodeIds}
        focusMode={focusMode}
        nodes={nodes}
        onAgentNodeArchive={onAgentNodeArchive}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        onSettingValueChange={onSettingValueChange}
        onToggleCompact={onToggleCompact}
        onTitleChange={onTitleChange}
      />
      <SpielwieseAgentNodePreviewSpotlight
        frame={focusMode.activePreviewSpotlightFrame}
      />
      <SpielwieseFocusedAgentNodeModal
        compactNodeIds={compactNodeIds}
        focusMode={focusMode}
        onAgentNodeArchive={onAgentNodeArchive}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        onSettingValueChange={onSettingValueChange}
        onToggleCompact={onToggleCompact}
        onTitleChange={onTitleChange}
      />
    </>
  );
}
