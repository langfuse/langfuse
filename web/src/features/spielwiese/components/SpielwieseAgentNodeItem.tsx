import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { SpielwieseAgentNodeExternalInsertRow } from "./SpielwieseAgentNodeExternalInsertRow";
import { SpielwieseDetachedUserDeckRegion } from "./SpielwieseDetachedUserDeckRegion";
import { SpielwiesePrimaryAgentDeckRegion } from "./SpielwiesePrimaryAgentDeckRegion";
import {
  getNodeToolOptions,
  type SpielwieseToolOption,
} from "./SpielwieseAgentNodeToolsField";

type PromptSectionInsertKind = "user" | "system" | "assistant" | "tool";

export type SpielwieseAgentNodeItemProps = {
  isCompact: boolean;
  isPreviewFocused: boolean;
  isPreviewFocusHidden: boolean;
  isPreviewSpotlighted: boolean;
  node: SpielwieseAgentNodeVM;
  onAgentNodeInsert: (nodeId: string, kind: "user" | "agent") => void;
  onPreviewHoverEnd: () => void;
  onPreviewHoverStart: () => void;
  onPromptSectionChange: (
    nodeId: string,
    sectionId: string,
    value: string,
  ) => void;
  onPromptSectionDelete: (nodeId: string, sectionId: string) => void;
  onPromptSectionInsert: (
    nodeId: string,
    kind: PromptSectionInsertKind,
  ) => void;
  onPromptSectionMove: (
    nodeId: string,
    sectionId: string,
    direction: "up" | "down",
  ) => void;
  onRegisterPreviewRegion: (element: HTMLDivElement | null) => void;
  onSettingValueChange: (
    nodeId: string,
    settingId: string,
    value: string,
  ) => void;
  onTitleChange: (nodeId: string, value: string) => void;
  onToggleCompact: () => void;
  onTogglePreviewFocus: () => void;
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
  onPromptSectionChange: SpielwieseAgentNodeItemProps["onPromptSectionChange"];
  onPromptSectionDelete: SpielwieseAgentNodeItemProps["onPromptSectionDelete"];
  onPromptSectionInsert: SpielwieseAgentNodeItemProps["onPromptSectionInsert"];
  onPromptSectionMove: SpielwieseAgentNodeItemProps["onPromptSectionMove"];
  toolOptions: SpielwieseToolOption[];
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

function getAgentNodeLayout(node: SpielwieseAgentNodeVM) {
  return node.layout ?? "composite";
}

function AgentNodePrimaryDeck(
  props: Omit<SpielwieseAgentNodeItemProps, "onAgentNodeInsert"> & {
    modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
    toolOptions: SpielwieseToolOption[];
  },
) {
  return <SpielwiesePrimaryAgentDeckRegion {...props} />;
}

function AgentNodeInsertFooter({
  nodeId,
  onAgentNodeInsert,
}: {
  nodeId: string;
  onAgentNodeInsert: SpielwieseAgentNodeItemProps["onAgentNodeInsert"];
}) {
  return (
    <SpielwieseAgentNodeExternalInsertRow
      nodeId={nodeId}
      onAgentNodeInsert={onAgentNodeInsert}
    />
  );
}

type AgentNodeDecksProps = Omit<
  SpielwieseAgentNodeItemProps,
  "onAgentNodeInsert"
> & {
  modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
  nodeLayout: ReturnType<typeof getAgentNodeLayout>;
  toolOptions: SpielwieseToolOption[];
};

function AgentNodeDecks({
  isCompact,
  isPreviewFocused,
  isPreviewFocusHidden,
  isPreviewSpotlighted,
  modelSetting,
  node,
  nodeLayout,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  onRegisterPreviewRegion,
  onSettingValueChange,
  onTitleChange,
  onToggleCompact,
  onTogglePreviewFocus,
  toolOptions,
}: AgentNodeDecksProps) {
  return (
    <>
      {nodeLayout !== "agent-only" ? (
        <AgentNodeDetachedUserDeck
          node={node}
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionInsert={onPromptSectionInsert}
          onPromptSectionMove={onPromptSectionMove}
          toolOptions={toolOptions}
        />
      ) : null}
      {nodeLayout !== "user-only" ? (
        <AgentNodePrimaryDeck
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
          onToggleCompact={onToggleCompact}
          onTogglePreviewFocus={onTogglePreviewFocus}
          toolOptions={toolOptions}
        />
      ) : null}
    </>
  );
}

export function SpielwieseAgentNodeItem({
  isCompact,
  isPreviewFocused,
  isPreviewFocusHidden,
  isPreviewSpotlighted,
  node,
  onAgentNodeInsert,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  onRegisterPreviewRegion,
  onSettingValueChange,
  onTitleChange,
  onToggleCompact,
  onTogglePreviewFocus,
}: SpielwieseAgentNodeItemProps) {
  const { modelSetting, toolOptions } = getAgentNodeDeckData(node);
  const nodeLayout = getAgentNodeLayout(node);

  return (
    <li
      className="group/agent-node grid gap-1.5 last:pb-5"
      data-testid="spielwiese-agent-node"
    >
      <AgentNodeDecks
        isCompact={isCompact}
        isPreviewFocused={isPreviewFocused}
        isPreviewFocusHidden={isPreviewFocusHidden}
        isPreviewSpotlighted={isPreviewSpotlighted}
        modelSetting={modelSetting}
        node={node}
        nodeLayout={nodeLayout}
        onPreviewHoverEnd={onPreviewHoverEnd}
        onPreviewHoverStart={onPreviewHoverStart}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        onRegisterPreviewRegion={onRegisterPreviewRegion}
        onSettingValueChange={onSettingValueChange}
        onTitleChange={onTitleChange}
        onToggleCompact={onToggleCompact}
        onTogglePreviewFocus={onTogglePreviewFocus}
        toolOptions={toolOptions}
      />
      <AgentNodeInsertFooter
        nodeId={node.id}
        onAgentNodeInsert={onAgentNodeInsert}
      />
    </li>
  );
}
