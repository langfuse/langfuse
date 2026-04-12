import { useState, type FocusEvent, type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import type { SpielwieseToolOption } from "./SpielwieseToolMessageSection";
import { SpielwieseAgentNodeCardDeck } from "./SpielwieseAgentNodeStackSupport";

type SpielwiesePrimaryAgentDeckRegionProps = {
  ariaHidden?: boolean;
  isCompact: boolean;
  isPreviewFocused: boolean;
  isPreviewFocusHidden: boolean;
  isPreviewSpotlighted: boolean;
  modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
  node: SpielwieseAgentNodeVM;
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
    kind: "user" | "system" | "assistant" | "tool",
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
  toolOptions: SpielwieseToolOption[];
};

type SpielwiesePrimaryAgentDeckSwitcherProps = Omit<
  SpielwiesePrimaryAgentDeckRegionProps,
  | "ariaHidden"
  | "isPreviewFocusHidden"
  | "isPreviewSpotlighted"
  | "onRegisterPreviewRegion"
> & {
  areNavButtonsVisible: boolean;
};

function useCardNavigationVisibilityState() {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);

  return {
    areCardNavButtonsVisible: isHovered || isFocusWithin,
    interactionProps: {
      onBlurCapture: (event: FocusEvent<HTMLElement>) => {
        const nextFocusedElement = event.relatedTarget;

        if (
          !(nextFocusedElement instanceof Node) ||
          !event.currentTarget.contains(nextFocusedElement)
        ) {
          setIsFocusWithin(false);
        }
      },
      onFocusCapture: () => setIsFocusWithin(true),
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
    },
  };
}

function getDeckRegionClassName({
  isPreviewFocusHidden,
  isPreviewSpotlighted,
}: {
  isPreviewFocusHidden: boolean;
  isPreviewSpotlighted: boolean;
}) {
  if (isPreviewSpotlighted) {
    return "z-[125] scale-105";
  }

  if (isPreviewFocusHidden) {
    return "pointer-events-none opacity-0";
  }

  return "";
}

function SpielwieseCardDeckRegion({
  ariaHidden,
  children,
  className,
  interactionState,
  onRegisterPreviewRegion,
}: {
  ariaHidden?: boolean;
  children: ReactNode;
  className?: string;
  interactionState: ReturnType<typeof useCardNavigationVisibilityState>;
  onRegisterPreviewRegion?: (element: HTMLDivElement | null) => void;
}) {
  return (
    <div
      aria-hidden={ariaHidden}
      className={className}
      data-testid="spielwiese-agent-node-card-deck"
      ref={onRegisterPreviewRegion}
      {...interactionState.interactionProps}
    >
      {children}
    </div>
  );
}

function SpielwiesePrimaryAgentDeckSwitcher({
  areNavButtonsVisible,
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
  onTitleChange,
  onToggleCompact,
  onTogglePreviewFocus,
  toolOptions,
}: SpielwiesePrimaryAgentDeckSwitcherProps) {
  const [activeCardView, setActiveCardView] = useState<"primary" | "secondary">(
    "primary",
  );

  return (
    <SpielwieseAgentNodeCardDeck
      activeView={activeCardView}
      areNavButtonsVisible={areNavButtonsVisible}
      cardTestId="spielwiese-agent-node-card"
      isCompact={isCompact}
      isPreviewFocused={isPreviewFocused}
      modelSetting={modelSetting}
      node={node}
      onPreviewHoverEnd={onPreviewHoverEnd}
      onPreviewHoverStart={onPreviewHoverStart}
      onPromptSectionChange={onPromptSectionChange}
      onPromptSectionDelete={onPromptSectionDelete}
      onPromptSectionInsert={onPromptSectionInsert}
      onPromptSectionMove={onPromptSectionMove}
      onSettingValueChange={onSettingValueChange}
      onShowPrimary={() => setActiveCardView("primary")}
      onShowSecondary={() => setActiveCardView("secondary")}
      onTogglePreviewFocus={onTogglePreviewFocus}
      onTitleChange={onTitleChange}
      onToggleCompact={onToggleCompact}
      toolOptions={toolOptions}
    />
  );
}

export function SpielwiesePrimaryAgentDeckRegion({
  ariaHidden,
  isPreviewFocusHidden,
  isPreviewSpotlighted,
  onRegisterPreviewRegion,
  ...props
}: SpielwiesePrimaryAgentDeckRegionProps) {
  const interactionState = useCardNavigationVisibilityState();
  const cardDeckClassName = cn(
    "relative transform-gpu transition-[transform,opacity,filter] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
    getDeckRegionClassName({
      isPreviewFocusHidden,
      isPreviewSpotlighted,
    }),
  );

  return (
    <SpielwieseCardDeckRegion
      ariaHidden={ariaHidden}
      className={cardDeckClassName}
      interactionState={interactionState}
      onRegisterPreviewRegion={onRegisterPreviewRegion}
    >
      <SpielwiesePrimaryAgentDeckSwitcher
        areNavButtonsVisible={interactionState.areCardNavButtonsVisible}
        {...props}
      />
    </SpielwieseCardDeckRegion>
  );
}
