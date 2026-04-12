import { useState } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import {
  SpielwieseAgentNodePreviewSpotlight,
  useSpielwieseAgentNodeFocusMode,
} from "./SpielwieseAgentNodeFocusMode";
import { SpielwieseDetachedUserDeckRegion } from "./SpielwieseDetachedUserDeckRegion";
import { SpielwieseFocusedAgentNodeModal } from "./SpielwieseFocusedAgentNodeModal";
import { SpielwiesePrimaryAgentDeckRegion } from "./SpielwiesePrimaryAgentDeckRegion";
import { getNodeToolOptions } from "./SpielwieseAgentNodeToolsField";
import { SpielwieseAgentNodeExternalInsertRow } from "./SpielwieseAgentNodeStackSupport";

type SpielwieseAgentNodeStackProps = {
  nodes: SpielwieseAgentNodeVM[];
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

type SpielwieseAgentNodeProps = {
  isCompact: boolean;
  isPreviewFocused: boolean;
  isPreviewFocusHidden: boolean;
  isPreviewSpotlighted: boolean;
  node: SpielwieseAgentNodeVM;
  onPreviewHoverEnd: () => void;
  onPreviewHoverStart: () => void;
  onPromptSectionDelete: SpielwieseAgentNodeStackProps["onPromptSectionDelete"];
  onPromptSectionInsert: SpielwieseAgentNodeStackProps["onPromptSectionInsert"];
  onRegisterPreviewRegion: (element: HTMLDivElement | null) => void;
  onTogglePreviewFocus: () => void;
  onToggleCompact: () => void;
  onPromptSectionChange: SpielwieseAgentNodeStackProps["onPromptSectionChange"];
  onPromptSectionMove: SpielwieseAgentNodeStackProps["onPromptSectionMove"];
  onSettingValueChange: SpielwieseAgentNodeStackProps["onSettingValueChange"];
  onTitleChange: SpielwieseAgentNodeStackProps["onTitleChange"];
};

function AgentNodeDetachedUserDeck({
  node,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  toolOptions,
}: {
  node: SpielwieseAgentNodeVM;
  onPromptSectionChange: SpielwieseAgentNodeStackProps["onPromptSectionChange"];
  onPromptSectionDelete: SpielwieseAgentNodeStackProps["onPromptSectionDelete"];
  onPromptSectionInsert: SpielwieseAgentNodeStackProps["onPromptSectionInsert"];
  onPromptSectionMove: SpielwieseAgentNodeStackProps["onPromptSectionMove"];
  toolOptions: ReturnType<typeof getNodeToolOptions>;
}) {
  return (
    <SpielwieseDetachedUserDeckRegion
      node={node}
      onPromptSectionChange={onPromptSectionChange}
      onPromptSectionDelete={onPromptSectionDelete}
      onPromptSectionInsert={onPromptSectionInsert}
      onPromptSectionMove={onPromptSectionMove}
      toolOptions={toolOptions}
    />
  );
}

function getAgentNodeDeckData(node: SpielwieseAgentNodeVM) {
  return {
    modelSetting: node.settings.find((setting) => setting.id === "model"),
    toolOptions: getNodeToolOptions(node.notes),
  };
}

function SpielwieseAgentNode({
  isCompact,
  isPreviewFocused,
  isPreviewFocusHidden,
  isPreviewSpotlighted,
  node,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onRegisterPreviewRegion,
  onTogglePreviewFocus,
  onToggleCompact,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseAgentNodeProps) {
  const { modelSetting, toolOptions } = getAgentNodeDeckData(node);

  return (
    <li
      className="group/agent-node grid gap-1.5 last:pb-5"
      data-testid="spielwiese-agent-node"
    >
      <AgentNodeDetachedUserDeck
        node={node}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        toolOptions={toolOptions}
      />
      <SpielwiesePrimaryAgentDeckRegion
        ariaHidden={isPreviewFocusHidden}
        isCompact={isCompact}
        isPreviewFocused={isPreviewFocused}
        isPreviewFocusHidden={isPreviewFocusHidden}
        isPreviewSpotlighted={isPreviewSpotlighted}
        modelSetting={modelSetting}
        node={node}
        onPreviewHoverEnd={onPreviewHoverEnd}
        onPreviewHoverStart={onPreviewHoverStart}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        onRegisterPreviewRegion={onRegisterPreviewRegion}
        onSettingValueChange={onSettingValueChange}
        onTitleChange={onTitleChange}
        onTogglePreviewFocus={onTogglePreviewFocus}
        onToggleCompact={onToggleCompact}
        toolOptions={toolOptions}
      />
      <SpielwieseAgentNodeExternalInsertRow
        nodeId={node.id}
        onPromptSectionInsert={onPromptSectionInsert}
      />
    </li>
  );
}

function SpielwieseAgentNodeList({
  compactNodeIds,
  focusMode,
  nodes,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
  onToggleCompact,
}: {
  compactNodeIds: Record<string, boolean>;
  focusMode: ReturnType<typeof useSpielwieseAgentNodeFocusMode>;
  nodes: SpielwieseAgentNodeVM[];
  onPromptSectionChange: SpielwieseAgentNodeStackProps["onPromptSectionChange"];
  onPromptSectionDelete: SpielwieseAgentNodeStackProps["onPromptSectionDelete"];
  onPromptSectionInsert: SpielwieseAgentNodeStackProps["onPromptSectionInsert"];
  onPromptSectionMove: SpielwieseAgentNodeStackProps["onPromptSectionMove"];
  onSettingValueChange: SpielwieseAgentNodeStackProps["onSettingValueChange"];
  onTitleChange: SpielwieseAgentNodeStackProps["onTitleChange"];
  onToggleCompact: (nodeId: string) => void;
}) {
  return (
    <ol
      className="relative isolate flex min-h-full flex-col gap-1.5 pt-4 pb-2 sm:pt-5"
      data-testid="spielwiese-agent-node-stack"
      role="list"
    >
      {nodes.map((node) => (
        <SpielwieseAgentNode
          isCompact={Boolean(compactNodeIds[node.id])}
          isPreviewFocused={focusMode.focusedNodeId === node.id}
          isPreviewFocusHidden={focusMode.focusedNodeId === node.id}
          isPreviewSpotlighted={focusMode.hoveredPreviewNodeId === node.id}
          key={node.id}
          node={node}
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
      ))}
    </ol>
  );
}

export function SpielwieseAgentNodeStack({
  nodes,
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
        compactNodeIds={compactNodeIds}
        focusMode={focusMode}
        nodes={nodes}
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
