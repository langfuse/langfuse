import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import {
  isOnboardingChrome,
  useSpielwieseEditorCanvasChrome,
} from "./SpielwieseEditorCanvasChromeContext";
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
  onAgentNodeArchive: (nodeId: string) => void;
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
  isCompact,
  isPreviewFocused,
  node,
  onAgentNodeArchive,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  onToggleCompact,
  onTogglePreviewFocus,
  toolOptions,
}: {
  isCompact: boolean;
  isPreviewFocused: boolean;
  node: SpielwieseAgentNodeVM;
  onAgentNodeArchive: SpielwieseAgentNodeItemProps["onAgentNodeArchive"];
  onPreviewHoverEnd: SpielwieseAgentNodeItemProps["onPreviewHoverEnd"];
  onPreviewHoverStart: SpielwieseAgentNodeItemProps["onPreviewHoverStart"];
  onPromptSectionChange: SpielwieseAgentNodeItemProps["onPromptSectionChange"];
  onPromptSectionDelete: SpielwieseAgentNodeItemProps["onPromptSectionDelete"];
  onPromptSectionInsert: SpielwieseAgentNodeItemProps["onPromptSectionInsert"];
  onPromptSectionMove: SpielwieseAgentNodeItemProps["onPromptSectionMove"];
  onToggleCompact: SpielwieseAgentNodeItemProps["onToggleCompact"];
  onTogglePreviewFocus: SpielwieseAgentNodeItemProps["onTogglePreviewFocus"];
  toolOptions: SpielwieseToolOption[];
}) {
  return (
    <SpielwieseDetachedUserDeckRegion
      isCompact={isCompact}
      isPreviewFocused={isPreviewFocused}
      node={node}
      onAgentNodeArchive={onAgentNodeArchive}
      onPreviewHoverEnd={onPreviewHoverEnd}
      onPreviewHoverStart={onPreviewHoverStart}
      onPromptSectionChange={onPromptSectionChange}
      onPromptSectionDelete={onPromptSectionDelete}
      onPromptSectionInsert={onPromptSectionInsert}
      onPromptSectionMove={onPromptSectionMove}
      onToggleCompact={onToggleCompact}
      onTogglePreviewFocus={onTogglePreviewFocus}
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
  props: SpielwieseAgentNodeItemProps & {
    modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
    toolOptions: SpielwieseToolOption[];
  },
) {
  return <SpielwiesePrimaryAgentDeckRegion {...props} />;
}

type AgentNodeDecksProps = SpielwieseAgentNodeItemProps & {
  modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
  nodeLayout: ReturnType<typeof getAgentNodeLayout>;
  toolOptions: SpielwieseToolOption[];
};

// eslint-disable-next-line max-lines-per-function
function AgentNodeDecks({
  onAgentNodeArchive,
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
          isCompact={isCompact}
          isPreviewFocused={
            nodeLayout === "user-only" ? false : isPreviewFocused
          }
          node={node}
          onAgentNodeArchive={onAgentNodeArchive}
          onPreviewHoverEnd={
            nodeLayout === "user-only" ? () => {} : onPreviewHoverEnd
          }
          onPreviewHoverStart={
            nodeLayout === "user-only" ? () => {} : onPreviewHoverStart
          }
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionInsert={onPromptSectionInsert}
          onPromptSectionMove={onPromptSectionMove}
          onToggleCompact={onToggleCompact}
          onTogglePreviewFocus={
            nodeLayout === "user-only" ? () => {} : onTogglePreviewFocus
          }
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
          onAgentNodeArchive={onAgentNodeArchive}
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
  onAgentNodeArchive,
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
  const chrome = useSpielwieseEditorCanvasChrome();
  const isOnboarding = isOnboardingChrome(chrome);
  const { modelSetting, toolOptions } = getAgentNodeDeckData(node);
  const nodeLayout = getAgentNodeLayout(node);

  return (
    <li
      className={
        isOnboarding
          ? "group/agent-node grid gap-1.5"
          : "group/agent-node grid gap-1.5 last:pb-5"
      }
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
        onAgentNodeArchive={onAgentNodeArchive}
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
    </li>
  );
}
