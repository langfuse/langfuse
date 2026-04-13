import { useState } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import type { SpielwieseToolOption } from "./SpielwieseToolMessageSection";
import { SpielwieseAgentNodeCardSwitcher } from "./SpielwieseAgentNodeCardSwitcher";
import { SpielwieseAgentNodePromptSections } from "./SpielwieseAgentNodePromptSections";
import {
  SpielwiesePromptDeckCardHeaderFrame,
  SpielwiesePromptDeckCardShell,
} from "./SpielwiesePromptDeckCardChrome";
import { useSpielwieseCollapseMotion } from "./spielwieseCollapseMotion";

type SpielwieseDetachedUserDeckRegionProps = {
  isCompact: boolean;
  isPreviewFocused: boolean;
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
  onToggleCompact: () => void;
  onTogglePreviewFocus: () => void;
  toolOptions: SpielwieseToolOption[];
};

type SpielwieseDetachedUserCardProps = SpielwieseDetachedUserDeckRegionProps & {
  cardTestId?: string;
};

function SpielwieseDetachedUserCard({
  cardTestId,
  isCompact,
  isPreviewFocused,
  node,
  onAgentNodeArchive,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onToggleCompact,
  onTogglePreviewFocus,
  toolOptions,
}: SpielwieseDetachedUserCardProps) {
  return (
    <SpielwiesePromptDeckCardShell
      data-testid={cardTestId ?? `${node.id}-detached-user-sections`}
    >
      <SpielwiesePromptDeckCardHeaderFrame
        className="p-0"
        data-testid="spielwiese-detached-user-card-frame"
        overlap={false}
      >
        <SpielwieseAgentNodePromptSections
          className="pt-0 pb-0"
          includeKinds={["user"]}
          isCompact={isCompact}
          isPreviewFocused={isPreviewFocused}
          nodeId={node.id}
          onAgentNodeArchive={onAgentNodeArchive}
          onPreviewHoverEnd={onPreviewHoverEnd}
          onPreviewHoverStart={onPreviewHoverStart}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionInsert={onPromptSectionInsert}
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionMove={onPromptSectionMove}
          onToggleCompact={onToggleCompact}
          onTogglePreviewFocus={onTogglePreviewFocus}
          promptSections={node.promptSections}
          showInsertRow={false}
          toolOptions={toolOptions}
          userLayout="detached"
        />
      </SpielwiesePromptDeckCardHeaderFrame>
    </SpielwiesePromptDeckCardShell>
  );
}

function useDetachedUserCardNavigationVisibilityState() {
  const [isHovered, setIsHovered] = useState(false);

  return {
    areNavButtonsVisible: isHovered,
    interactionProps: {
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
    },
  };
}

function getDetachedUserSharedCardProps({
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
}: SpielwieseDetachedUserDeckRegionProps) {
  return {
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
  };
}

// eslint-disable-next-line max-lines-per-function
export function SpielwieseDetachedUserDeckRegion({
  isCompact,
  isPreviewFocused,
  node,
  onAgentNodeArchive,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onToggleCompact,
  onTogglePreviewFocus,
  toolOptions,
}: SpielwieseDetachedUserDeckRegionProps) {
  const [activeView, setActiveView] = useState<"primary" | "secondary">(
    "primary",
  );
  const interactionState = useDetachedUserCardNavigationVisibilityState();
  const collapseMotion = useSpielwieseCollapseMotion({
    isCollapsed: isCompact,
    onToggle: onToggleCompact,
  });
  const sharedCardProps = getDetachedUserSharedCardProps({
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
    onToggleCompact: collapseMotion.onToggleWithMotion,
    onTogglePreviewFocus,
    toolOptions,
  });

  return (
    <div
      data-testid="spielwiese-detached-user-card-deck"
      {...interactionState.interactionProps}
    >
      <SpielwieseAgentNodeCardSwitcher
        activeView={activeView}
        areNavButtonsVisible={interactionState.areNavButtonsVisible}
        nodeId={`${node.id} user`}
        primaryCard={<SpielwieseDetachedUserCard {...sharedCardProps} />}
        secondaryCard={
          <SpielwieseDetachedUserCard
            {...sharedCardProps}
            cardTestId="spielwiese-detached-user-secondary-card"
          />
        }
        testIdBase="spielwiese-detached-user-card"
        viewportClassName={collapseMotion.transitionClassName}
        viewportTransitionState={collapseMotion.phase}
        onShowPrimary={() => setActiveView("primary")}
        onShowSecondary={() => setActiveView("secondary")}
      />
    </div>
  );
}
