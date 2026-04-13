/* eslint-disable max-lines */
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import type { SpielwieseToolOption } from "./SpielwieseToolMessageSection";
import { SpielwieseAgentNodeCardSwitcher } from "./SpielwieseAgentNodeCardSwitcher";
import {
  isOnboardingChrome,
  useSpielwieseEditorCanvasChrome,
} from "./SpielwieseEditorCanvasChromeContext";
import { SpielwieseAgentNodeHeader } from "./SpielwieseAgentNodeHeader";
import { SpielwieseAgentNodePromptSections } from "./SpielwieseAgentNodePromptSections";
import { SpielwieseJsonFormatComposer } from "./SpielwieseJsonFormatComposer";
import {
  SpielwiesePromptDeckCardHeaderFrame,
  SpielwiesePromptDeckCardShell,
} from "./SpielwiesePromptDeckCardChrome";
import { getMessageKind } from "./spielwieseMessageTone";
import { getModelShellTintClassName } from "./spielwieseModelTint";

type SpielwiesePrimaryAgentNodeCardProps = {
  cardTestId?: string;
  className?: string;
  isCompact: boolean;
  isPreviewFocused: boolean;
  modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
  node: SpielwieseAgentNodeVM;
  onAgentNodeArchive: (nodeId: string) => void;
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
  const chrome = useSpielwieseEditorCanvasChrome();

  if (isCompact || !systemSection || isOnboardingChrome(chrome)) {
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

function getAgentNodeCardDeckSharedProps({
  isCompact,
  isPreviewFocused,
  modelSetting,
  node,
  onAgentNodeArchive,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  onSettingValueChange,
  onToggleCompact,
  onTogglePreviewFocus,
  onTitleChange,
  toolOptions,
}: Omit<
  SpielwieseAgentNodeCardDeckProps,
  | "activeView"
  | "areNavButtonsVisible"
  | "cardTestId"
  | "cardViewportClassName"
  | "cardViewportTransitionState"
  | "onShowPrimary"
  | "onShowSecondary"
>) {
  return {
    isCompact,
    isPreviewFocused,
    modelSetting,
    node,
    onAgentNodeArchive,
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
}

// eslint-disable-next-line max-lines-per-function
export function SpielwiesePrimaryAgentNodeCard({
  cardTestId = "spielwiese-agent-node-card",
  className,
  isCompact,
  isPreviewFocused,
  modelSetting,
  node,
  onAgentNodeArchive,
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
    onArchiveNode: () => onAgentNodeArchive(node.id),
    onPreviewHoverEnd,
    onPreviewHoverStart,
    onSettingValueChange,
    onTitleChange,
    onToggleCompact,
    onTogglePreviewFocus,
  };
  return (
    <SpielwiesePromptDeckCardShell
      className={`${getModelShellTintClassName(modelSetting?.value)} ${className ?? ""}`}
      data-testid={cardTestId}
    >
      <SpielwiesePromptDeckCardHeaderFrame
        className={getModelShellTintClassName(modelSetting?.value)}
        data-testid="spielwiese-agent-node-header-frame"
        overlap={!isCompact}
      >
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
  cardViewportClassName?: string;
  cardViewportTransitionState?: string;
  isPreviewFocused: boolean;
  onPreviewHoverEnd: () => void;
  onPreviewHoverStart: () => void;
  onShowPrimary: () => void;
  onShowSecondary: () => void;
  onTogglePreviewFocus: () => void;
};

// eslint-disable-next-line max-lines-per-function
export function SpielwieseAgentNodeCardDeck({
  activeView,
  areNavButtonsVisible,
  cardTestId,
  cardViewportClassName,
  cardViewportTransitionState,
  isCompact,
  isPreviewFocused,
  modelSetting,
  node,
  onAgentNodeArchive,
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
  const sharedCardProps = getAgentNodeCardDeckSharedProps({
    isCompact,
    isPreviewFocused,
    modelSetting,
    node,
    onAgentNodeArchive,
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
  });
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
      viewportClassName={cardViewportClassName}
      viewportTransitionState={cardViewportTransitionState}
      onShowPrimary={onShowPrimary}
      onShowSecondary={onShowSecondary}
    />
  );
}
