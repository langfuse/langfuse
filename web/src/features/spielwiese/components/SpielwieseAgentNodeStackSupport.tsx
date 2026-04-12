import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import type { SpielwieseToolOption } from "./SpielwieseToolMessageSection";
import { SpielwieseAgentNodeCardSwitcher } from "./SpielwieseAgentNodeCardSwitcher";
import { SpielwieseMessageInsertRow } from "./SpielwieseMessageInsertRow";
import { SpielwieseAgentNodeHeader } from "./SpielwieseAgentNodeHeader";
import { SpielwieseAgentNodePromptSections } from "./SpielwieseAgentNodePromptSections";
import { SpielwieseJsonFormatComposer } from "./SpielwieseJsonFormatComposer";
import {
  SpielwiesePromptDeckCardHeaderFrame,
  SpielwiesePromptDeckCardShell,
} from "./SpielwiesePromptDeckCardChrome";
import { getMessageKind } from "./spielwieseMessageTone";

type SpielwiesePrimaryAgentNodeCardProps = {
  cardTestId?: string;
  isCompact: boolean;
  isPreviewFocused: boolean;
  modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
  node: SpielwieseAgentNodeVM;
  onPreviewHoverEnd: () => void;
  onPreviewHoverStart: () => void;
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
  onTogglePreviewFocus: () => void;
  onToggleCompact: () => void;
  onTitleChange: (nodeId: string, value: string) => void;
  toolOptions: SpielwieseToolOption[];
};

function getSystemPromptSection(node: SpielwieseAgentNodeVM) {
  return node.promptSections.find((s) => getMessageKind(s.id) === "system");
}

function PrimaryAgentSystemPromptSections({
  promptSectionProps,
}: {
  promptSectionProps: {
    isCompact: boolean;
    nodeId: string;
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
    promptSections: SpielwieseAgentNodeVM["promptSections"];
    toolOptions: SpielwieseToolOption[];
  };
}) {
  return (
    <SpielwieseAgentNodePromptSections
      className="pt-0 pb-0"
      includeKinds={["system"]}
      rowTopPadding="none"
      showInsertRow={false}
      {...promptSectionProps}
    />
  );
}

function PrimaryAgentResponsePromptSections({
  promptSectionProps,
}: {
  promptSectionProps: {
    isCompact: boolean;
    nodeId: string;
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
    promptSections: SpielwieseAgentNodeVM["promptSections"];
    toolOptions: SpielwieseToolOption[];
  };
}) {
  return (
    <SpielwieseAgentNodePromptSections
      includeKinds={["assistant", "tool"]}
      insertSurface="bare"
      showInsertRow={false}
      spacing="flush"
      {...promptSectionProps}
    />
  );
}

function PrimaryAgentJsonFormatComposer({
  isCompact,
  nodeId,
  onPromptSectionInsert,
  systemSection,
}: {
  isCompact: boolean;
  nodeId: string;
  onPromptSectionInsert: (
    nodeId: string,
    kind: "user" | "system" | "assistant" | "tool",
  ) => void;
  systemSection: SpielwieseAgentNodeVM["promptSections"][number] | undefined;
}) {
  if (isCompact || !systemSection) {
    return null;
  }
  return (
    <SpielwieseJsonFormatComposer
      className="-mx-0.5 mt-1 pb-0.5"
      nodeId={nodeId}
      onPromptSectionInsert={onPromptSectionInsert}
      sectionLabel={systemSection.label}
    />
  );
}

function createAgentNodeCard(
  cardTestId: string,
  sharedCardProps: Omit<SpielwiesePrimaryAgentNodeCardProps, "cardTestId">,
) {
  // prettier-ignore
  return <SpielwiesePrimaryAgentNodeCard {...sharedCardProps} cardTestId={cardTestId} />;
}

export function SpielwiesePrimaryAgentNodeCard({
  cardTestId = "spielwiese-agent-node-card",
  isCompact,
  isPreviewFocused,
  modelSetting,
  node,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onTogglePreviewFocus,
  onToggleCompact,
  onTitleChange,
  toolOptions,
}: SpielwiesePrimaryAgentNodeCardProps) {
  const systemSection = getSystemPromptSection(node);
  const promptSectionProps = {
    isCompact,
    nodeId: node.id,
    onPromptSectionChange,
    onPromptSectionDelete,
    onPromptSectionInsert,
    onPromptSectionMove,
    promptSections: node.promptSections,
    toolOptions,
  };
  const headerProps = {
    isCompact,
    isPreviewFocused,
    modelSetting,
    node,
    onPreviewHoverEnd,
    onPreviewHoverStart,
    onSettingValueChange,
    onTitleChange,
    onToggleCompact,
    onTogglePreviewFocus,
  };
  return (
    <SpielwiesePromptDeckCardShell data-testid={cardTestId}>
      <SpielwiesePromptDeckCardHeaderFrame data-testid="spielwiese-agent-node-header-frame">
        <SpielwieseAgentNodeHeader {...headerProps}>
          {/* prettier-ignore */}
          <PrimaryAgentSystemPromptSections promptSectionProps={promptSectionProps} />
        </SpielwieseAgentNodeHeader>
      </SpielwiesePromptDeckCardHeaderFrame>
      {/* prettier-ignore */}
      <PrimaryAgentResponsePromptSections promptSectionProps={promptSectionProps} />
      <PrimaryAgentJsonFormatComposer
        isCompact={isCompact}
        nodeId={node.id}
        onPromptSectionInsert={onPromptSectionInsert}
        systemSection={systemSection}
      />
    </SpielwiesePromptDeckCardShell>
  );
}

type SpielwieseAgentNodeCardDeckProps = SpielwiesePrimaryAgentNodeCardProps & {
  activeView: "primary" | "secondary";
  areNavButtonsVisible: boolean;
  isPreviewFocused: boolean;
  onPreviewHoverEnd: () => void;
  onPreviewHoverStart: () => void;
  onShowPrimary: () => void;
  onShowSecondary: () => void;
  onTogglePreviewFocus: () => void;
};

export function SpielwieseAgentNodeCardDeck({
  activeView,
  areNavButtonsVisible,
  cardTestId,
  isCompact,
  isPreviewFocused,
  modelSetting,
  node,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onShowPrimary,
  onShowSecondary,
  onTogglePreviewFocus,
  onTitleChange,
  onToggleCompact,
  toolOptions,
}: SpielwieseAgentNodeCardDeckProps) {
  const sharedCardProps = {
    isCompact,
    isPreviewFocused,
    modelSetting,
    node,
    onPreviewHoverEnd,
    onPreviewHoverStart,
    onPromptSectionChange,
    onPromptSectionDelete,
    onPromptSectionInsert,
    onPromptSectionMove,
    onSettingValueChange,
    onTogglePreviewFocus,
    onTitleChange,
    onToggleCompact,
    toolOptions,
  };
  const primaryCard = createAgentNodeCard(cardTestId, sharedCardProps);
  const secondaryCard = createAgentNodeCard(
    "spielwiese-agent-node-secondary-card",
    sharedCardProps,
  );
  return (
    <SpielwieseAgentNodeCardSwitcher
      activeView={activeView}
      areNavButtonsVisible={areNavButtonsVisible}
      nodeId={node.id}
      primaryCard={primaryCard}
      secondaryCard={secondaryCard}
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
      className="pointer-events-auto mt-[8px] ml-[18px] opacity-100"
      nodeId={nodeId}
      onPromptSectionInsert={onPromptSectionInsert}
      rowTestId="spielwiese-message-insert-external-row"
      variant="text"
    />
  );
}
