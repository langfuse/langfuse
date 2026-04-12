import { useState, type FocusEvent } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import type { SpielwieseToolOption } from "./SpielwieseToolMessageSection";
import { SpielwieseAgentNodeCardSwitcher } from "./SpielwieseAgentNodeCardSwitcher";
import { SpielwieseAgentNodePromptSections } from "./SpielwieseAgentNodePromptSections";

const spielwieseDetachedUserShellClassName =
  "group flex w-full flex-col gap-1.5 overflow-visible rounded-(--node-shell-radius) border border-[rgba(0,0,0,0.05)] bg-[#FBFBFB] px-[2px] pt-[2px] pb-[2px] [--node-shell-gap:2px] [--node-shell-radius:16px]";

type SpielwieseDetachedUserDeckRegionProps = {
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
  toolOptions: SpielwieseToolOption[];
};

type SpielwieseDetachedUserCardProps = SpielwieseDetachedUserDeckRegionProps & {
  cardTestId?: string;
};

function SpielwieseDetachedUserCard({
  cardTestId,
  node,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  toolOptions,
}: SpielwieseDetachedUserCardProps) {
  return (
    <div
      className={cn(spielwieseDetachedUserShellClassName, "overflow-visible")}
      data-testid={cardTestId ?? `${node.id}-detached-user-sections`}
    >
      <SpielwieseAgentNodePromptSections
        className="pt-0 pb-0"
        includeKinds={["user"]}
        nodeId={node.id}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionMove={onPromptSectionMove}
        promptSections={node.promptSections}
        showInsertRow={false}
        toolOptions={toolOptions}
        userLayout="detached"
      />
    </div>
  );
}

function useDetachedUserCardNavigationVisibilityState() {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);

  return {
    areNavButtonsVisible: isHovered || isFocusWithin,
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

export function SpielwieseDetachedUserDeckRegion({
  node,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  toolOptions,
}: SpielwieseDetachedUserDeckRegionProps) {
  const [activeView, setActiveView] = useState<"primary" | "secondary">(
    "primary",
  );
  const interactionState = useDetachedUserCardNavigationVisibilityState();
  const sharedCardProps = {
    node,
    onPromptSectionChange,
    onPromptSectionDelete,
    onPromptSectionInsert,
    onPromptSectionMove,
    toolOptions,
  };

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
        onShowPrimary={() => setActiveView("primary")}
        onShowSecondary={() => setActiveView("secondary")}
      />
    </div>
  );
}
