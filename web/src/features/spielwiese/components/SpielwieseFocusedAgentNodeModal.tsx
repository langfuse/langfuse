import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import {
  SpielwieseAgentNodeFocusModal,
  type useSpielwieseAgentNodeFocusMode,
} from "./SpielwieseAgentNodeFocusMode";
import { getNodeToolOptions } from "./SpielwieseAgentNodeToolsField";
import { SpielwiesePrimaryAgentNodeCard } from "./SpielwieseAgentNodeStackSupport";

type SpielwieseFocusedAgentNodeModalProps = {
  compactNodeIds: Record<string, boolean>;
  focusMode: ReturnType<typeof useSpielwieseAgentNodeFocusMode>;
  onAgentNodeArchive: (nodeId: string) => void;
  onPromptSectionChange: (
    nodeId: string,
    sectionId: string,
    value: string,
  ) => void;
  onPromptSectionDelete: (nodeId: string, sectionId: string) => void;
  onPromptSectionInsert: (
    nodeId: string,
    kind: "user" | "system" | "assistant" | "tool",
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
  onToggleCompact: (nodeId: string) => void;
};

function FocusedAgentNodeCard({
  compactNodeIds,
  focusedNode,
  onAgentNodeArchive,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
  onToggleCompact,
  onTogglePreviewFocus,
}: {
  compactNodeIds: Record<string, boolean>;
  focusedNode: SpielwieseAgentNodeVM;
  onAgentNodeArchive: SpielwieseFocusedAgentNodeModalProps["onAgentNodeArchive"];
  onPromptSectionChange: SpielwieseFocusedAgentNodeModalProps["onPromptSectionChange"];
  onPromptSectionDelete: SpielwieseFocusedAgentNodeModalProps["onPromptSectionDelete"];
  onPromptSectionInsert: SpielwieseFocusedAgentNodeModalProps["onPromptSectionInsert"];
  onPromptSectionMove: SpielwieseFocusedAgentNodeModalProps["onPromptSectionMove"];
  onSettingValueChange: SpielwieseFocusedAgentNodeModalProps["onSettingValueChange"];
  onTitleChange: SpielwieseFocusedAgentNodeModalProps["onTitleChange"];
  onToggleCompact: () => void;
  onTogglePreviewFocus: () => void;
}) {
  return (
    <SpielwiesePrimaryAgentNodeCard
      cardTestId="spielwiese-agent-node-focus-card"
      isCompact={Boolean(compactNodeIds[focusedNode.id])}
      isPreviewFocused
      modelSetting={focusedNode.settings.find(
        (setting) => setting.id === "model",
      )}
      node={focusedNode}
      onAgentNodeArchive={onAgentNodeArchive}
      onPreviewHoverEnd={() => {}}
      onPreviewHoverStart={() => {}}
      onPromptSectionChange={onPromptSectionChange}
      onPromptSectionDelete={onPromptSectionDelete}
      onPromptSectionInsert={onPromptSectionInsert}
      onPromptSectionMove={onPromptSectionMove}
      onSettingValueChange={onSettingValueChange}
      onTitleChange={onTitleChange}
      onToggleCompact={onToggleCompact}
      onTogglePreviewFocus={onTogglePreviewFocus}
      toolOptions={getNodeToolOptions(focusedNode.notes)}
    />
  );
}

export function SpielwieseFocusedAgentNodeModal({
  compactNodeIds,
  focusMode,
  onAgentNodeArchive,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
  onToggleCompact,
}: SpielwieseFocusedAgentNodeModalProps) {
  return (
    <SpielwieseAgentNodeFocusModal
      isOpen={Boolean(focusMode.focusedNode)}
      nodeId={focusMode.focusedNode?.id ?? "node"}
      onClose={() => focusMode.setFocusedNodeId(null)}
    >
      {focusMode.focusedNode ? (
        <FocusedAgentNodeCard
          compactNodeIds={compactNodeIds}
          focusedNode={focusMode.focusedNode}
          onAgentNodeArchive={onAgentNodeArchive}
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionInsert={onPromptSectionInsert}
          onPromptSectionMove={onPromptSectionMove}
          onSettingValueChange={onSettingValueChange}
          onTitleChange={onTitleChange}
          onToggleCompact={() => onToggleCompact(focusMode.focusedNode.id)}
          onTogglePreviewFocus={() => focusMode.setFocusedNodeId(null)}
        />
      ) : null}
    </SpielwieseAgentNodeFocusModal>
  );
}
