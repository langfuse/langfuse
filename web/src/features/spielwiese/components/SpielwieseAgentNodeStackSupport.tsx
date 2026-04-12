import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import type { SpielwieseToolOption } from "./SpielwieseToolMessageSection";
import { SpielwieseAgentNodeCardSwitcher } from "./SpielwieseAgentNodeCardSwitcher";
import { SpielwieseMessageInsertRow } from "./SpielwieseMessageInsertRow";
import { SpielwieseAgentNodeHeader } from "./SpielwieseAgentNodeHeader";
import { SpielwieseAgentNodePromptSections } from "./SpielwieseAgentNodePromptSections";

const spielwieseAgentNodeShellClassName =
  "group flex w-full flex-col gap-1.5 overflow-visible rounded-(--node-shell-radius) border border-[rgba(0,0,0,0.05)] bg-[#FBFBFB] px-[2px] pt-[2px] pb-[2px] [--node-shell-gap:2px] [--node-shell-radius:16px]";

type SpielwiesePrimaryAgentNodeCardProps = {
  cardTestId?: string;
  isCompact: boolean;
  modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
  node: SpielwieseAgentNodeVM;
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
  onToggleCompact: () => void;
  onTitleChange: (nodeId: string, value: string) => void;
  toolOptions: SpielwieseToolOption[];
};

export function SpielwiesePrimaryAgentNodeCard({
  cardTestId = "spielwiese-agent-node-card",
  isCompact,
  modelSetting,
  node,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onToggleCompact,
  onTitleChange,
  toolOptions,
}: SpielwiesePrimaryAgentNodeCardProps) {
  return (
    <div className={spielwieseAgentNodeShellClassName} data-testid={cardTestId}>
      <SpielwieseAgentNodeHeader
        isCompact={isCompact}
        modelSetting={modelSetting}
        node={node}
        onToggleCompact={onToggleCompact}
        onSettingValueChange={onSettingValueChange}
        onTitleChange={onTitleChange}
      />
      <div>
        <SpielwieseAgentNodePromptSections
          includeKinds={["system", "assistant", "tool"]}
          isCompact={isCompact}
          nodeId={node.id}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionInsert={onPromptSectionInsert}
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionMove={onPromptSectionMove}
          promptSections={node.promptSections}
          toolOptions={toolOptions}
        />
      </div>
    </div>
  );
}

type SpielwieseAgentNodeCardDeckProps = SpielwiesePrimaryAgentNodeCardProps & {
  activeView: "primary" | "secondary";
  onShowPrimary: () => void;
  onShowSecondary: () => void;
};

export function SpielwieseAgentNodeCardDeck({
  activeView,
  cardTestId,
  isCompact,
  modelSetting,
  node,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onShowPrimary,
  onShowSecondary,
  onTitleChange,
  onToggleCompact,
  toolOptions,
}: SpielwieseAgentNodeCardDeckProps) {
  const sharedCardProps = {
    isCompact,
    modelSetting,
    node,
    onPromptSectionChange,
    onPromptSectionDelete,
    onPromptSectionInsert,
    onPromptSectionMove,
    onSettingValueChange,
    onTitleChange,
    onToggleCompact,
    toolOptions,
  };

  return (
    <SpielwieseAgentNodeCardSwitcher
      activeView={activeView}
      nodeId={node.id}
      primaryCard={
        <SpielwiesePrimaryAgentNodeCard
          {...sharedCardProps}
          cardTestId={cardTestId}
        />
      }
      secondaryCard={
        <SpielwiesePrimaryAgentNodeCard
          {...sharedCardProps}
          cardTestId="spielwiese-agent-node-secondary-card"
        />
      }
      onShowPrimary={onShowPrimary}
      onShowSecondary={onShowSecondary}
    />
  );
}

export function SpielwieseAgentNodeExternalInsertRow({
  nodeId,
  onPromptSectionInsert,
}: {
  nodeId: string;
  onPromptSectionInsert: (
    nodeId: string,
    kind: "user" | "system" | "assistant" | "tool",
  ) => void;
}) {
  return (
    <SpielwieseMessageInsertRow
      className="pointer-events-none opacity-0 transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-focus-within/agent-node:pointer-events-auto group-focus-within/agent-node:opacity-100 group-hover/agent-node:pointer-events-auto group-hover/agent-node:opacity-100"
      nodeId={nodeId}
      onPromptSectionInsert={onPromptSectionInsert}
      rowTestId="spielwiese-message-insert-external-row"
      variant="text"
    />
  );
}
