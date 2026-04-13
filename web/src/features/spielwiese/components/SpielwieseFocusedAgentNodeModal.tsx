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
      className="h-full w-full [&_[aria-label$='Instructions']]:h-full [&_[aria-label$='Instructions']]:min-h-[calc(1002px-15rem)] [&_[data-section-id='system']]:flex [&_[data-section-id='system']]:h-full [&_[data-section-id='system']]:flex-col [&_[data-testid='spielwiese-agent-node-header-frame']]:flex [&_[data-testid='spielwiese-agent-node-header-frame']]:h-full [&_[data-testid='spielwiese-agent-node-header-frame']]:flex-col [&_[data-testid='spielwiese-agent-node-header-shell']]:flex [&_[data-testid='spielwiese-agent-node-header-shell']]:h-full [&_[data-testid='spielwiese-agent-node-header-shell']]:flex-1 [&_[data-testid='spielwiese-agent-node-header-shell']]:flex-col [&_[data-testid='spielwiese-mustache-root']]:h-full [&_[data-testid='spielwiese-system-message-prompt-shell']]:flex [&_[data-testid='spielwiese-system-message-prompt-shell']]:min-h-[calc(1002px-15rem)] [&_[data-testid='spielwiese-system-message-prompt-shell']]:flex-1 [&_[data-testid='spielwiese-system-message-prompt-shell']]:flex-col"
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
      sourceFrame={focusMode.focusedPreviewFrame}
      onClose={focusMode.closeFocusMode}
    >
      {focusMode.focusedNode ? (
        <div
          className="flex h-full w-full items-stretch justify-center"
          data-testid="spielwiese-agent-node-focus-card-layout"
        >
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
            onTogglePreviewFocus={focusMode.closeFocusMode}
          />
        </div>
      ) : null}
    </SpielwieseAgentNodeFocusModal>
  );
}
