/* eslint-disable max-lines */
"use client";

import { type TransitionEvent, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { getModelDisplayLabel } from "./spielwieseModelCatalog";
import {
  getModelPickerAnimationStyle,
  SpielwieseModelPickerContents,
  spielwieseModelPickerPanelClassName,
  type SpielwieseModelPickerProps,
} from "./SpielwieseModelPicker";
import { SpielwieseModelProviderMark } from "./SpielwieseModelProviderMark";
import {
  SpielwieseHeaderStripTag,
  spielwieseInlineInputClassName,
  spielwieseStripItemFieldClassName,
} from "./SpielwieseHeaderStrip";
import {
  isOnboardingChrome,
  isOnboardingPreviewChrome,
  useSpielwieseEditorCanvasChrome,
} from "./SpielwieseEditorCanvasChromeContext";
import { getModelTintClassName } from "./spielwieseModelTint";

function SpielwieseAgentTitleField({
  node,
  onTitleChange,
}: {
  node: SpielwieseAgentNodeVM;
  onTitleChange: (nodeId: string, value: string) => void;
}) {
  return (
    <div className="flex min-w-0 shrink-0 items-center px-2.5">
      <Input
        aria-label={`${node.id} title`}
        className={cn(
          spielwieseInlineInputClassName,
          spielwieseStripItemFieldClassName,
          "text-foreground placeholder:text-foreground/40 [field-sizing:content] w-auto max-w-[14rem] min-w-[1ch] px-0 text-[13px] font-semibold tracking-[-0.01em] placeholder:font-normal max-sm:text-base/5 sm:max-w-[18rem]",
        )}
        name={`${node.id}-title`}
        onChange={(event) => onTitleChange(node.id, event.target.value)}
        placeholder="Name your agent"
        size={Math.max(node.title.length, 1)}
        value={node.title}
      />
    </div>
  );
}

function SpielwieseAgentModelSegment({
  currentModel,
  isDisabled = false,
  isOpen = false,
  nodeId,
}: {
  currentModel: string;
  isDisabled?: boolean;
  isOpen?: boolean;
  nodeId: string;
}) {
  const displayModelLabel = getModelDisplayLabel(currentModel);

  return (
    <div className="flex shrink-0 items-center pr-1">
      <PopoverTrigger
        aria-label={`${nodeId} Model`}
        className={cn(
          "inline-flex h-7 w-auto max-w-[14rem] shrink-0 items-center gap-2 rounded-none border-0 bg-transparent px-0 text-[13px] font-medium whitespace-nowrap transition-[color,opacity,transform] duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)] outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-100 sm:max-w-[18rem]",
          isDisabled ? "text-foreground/42" : "text-foreground",
          isOpen && "translate-y-[-0.5px]",
        )}
        disabled={isDisabled}
      >
        <span className="inline-flex min-w-0 items-center">
          <SpielwieseHeaderStripTag
            className={cn(
              "bg-transparent transition-opacity duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
              isDisabled && "opacity-55",
            )}
            label=""
            revealLabelWidthClassName="max-w-0"
            revealWidthClassName="w-6"
          >
            <SpielwieseModelProviderMark currentModel={currentModel} />
          </SpielwieseHeaderStripTag>
          <span className="min-w-0 truncate px-2.5">{displayModelLabel}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 stroke-[2.2px] transition-[color,transform,opacity] duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
            isDisabled ? "text-foreground/24" : "text-foreground/36",
            isOpen && "text-foreground/48 rotate-180",
          )}
        />
      </PopoverTrigger>
    </div>
  );
}

function SpielwieseAgentTitleSurface({
  currentModel,
  isOpen = false,
  node,
  onTransitionEnd,
  onTitleChange,
}: {
  currentModel: string;
  isOpen?: boolean;
  node: SpielwieseAgentNodeVM;
  onTransitionEnd?: (event: React.TransitionEvent<HTMLDivElement>) => void;
  onTitleChange: (nodeId: string, value: string) => void;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-7 max-w-full items-center overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-black/4 transition-[border-color,box-shadow,background-color,transform] duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
        getModelTintClassName(currentModel),
        isOpen &&
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.76),0_10px_24px_rgba(15,23,42,0.08)]",
      )}
      data-testid="spielwiese-agent-title-control"
      onTransitionEnd={onTransitionEnd}
    >
      <SpielwieseAgentModelSegment
        currentModel={currentModel}
        isOpen={isOpen}
        nodeId={node.id}
      />
      <div className="w-px shrink-0 self-stretch bg-black/8" />
      <SpielwieseAgentTitleField node={node} onTitleChange={onTitleChange} />
    </div>
  );
}

function SpielwieseAgentModelOnlySurface({
  currentModel,
  isMuted = false,
  isOpen = false,
  node,
  onTransitionEnd,
}: {
  currentModel: string;
  isMuted?: boolean;
  isOpen?: boolean;
  node: SpielwieseAgentNodeVM;
  onTransitionEnd?: (event: React.TransitionEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-7 max-w-full items-center overflow-hidden rounded-[10px] border shadow-none ring-1 transition-[opacity,border-color,box-shadow,background-color,transform] duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
        isMuted
          ? "border-[rgba(0,0,0,0.05)] bg-[rgba(247,247,248,0.96)] opacity-75 ring-black/3"
          : "border-[rgba(0,0,0,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-black/4",
        getModelTintClassName(currentModel),
        isOpen &&
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.76),0_10px_24px_rgba(15,23,42,0.08)]",
      )}
      data-testid="spielwiese-agent-title-control"
      onTransitionEnd={onTransitionEnd}
    >
      <SpielwieseAgentModelSegment
        currentModel={currentModel}
        isDisabled={isMuted}
        isOpen={isOpen}
        nodeId={node.id}
      />
    </div>
  );
}

function useOnboardingModelPickerHandoff({
  isModelPickerOpen,
  isOnboardingModelSelection,
  onModelPickerOpenChange,
}: {
  isModelPickerOpen: boolean;
  isOnboardingModelSelection: boolean;
  onModelPickerOpenChange: (open: boolean) => void;
}) {
  const previousModelSelectionStateRef = useRef(isOnboardingModelSelection);
  const shouldAutoOpenOnboardingPickerRef = useRef(false);

  if (
    isOnboardingModelSelection &&
    !previousModelSelectionStateRef.current &&
    !isModelPickerOpen
  ) {
    shouldAutoOpenOnboardingPickerRef.current = true;
  }

  if (!isOnboardingModelSelection) {
    shouldAutoOpenOnboardingPickerRef.current = false;
  }

  previousModelSelectionStateRef.current = isOnboardingModelSelection;

  return (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (!shouldAutoOpenOnboardingPickerRef.current) {
      return;
    }

    shouldAutoOpenOnboardingPickerRef.current = false;
    onModelPickerOpenChange(true);
  };
}

function SpielwieseAgentTitleControlSurface({
  currentModel,
  isOnboarding,
  isOnboardingPreview,
  isOpen,
  node,
  onTitleChange,
  onTransitionEnd,
}: {
  currentModel: string;
  isOnboarding: boolean;
  isOnboardingPreview: boolean;
  isOpen: boolean;
  node: SpielwieseAgentNodeVM;
  onTitleChange: (nodeId: string, value: string) => void;
  onTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void;
}) {
  if (isOnboarding) {
    return (
      <SpielwieseAgentModelOnlySurface
        currentModel={currentModel}
        isOpen={isOpen}
        isMuted={isOnboardingPreview}
        node={node}
        onTransitionEnd={onTransitionEnd}
      />
    );
  }

  return (
    <SpielwieseAgentTitleSurface
      currentModel={currentModel}
      isOpen={isOpen}
      node={node}
      onTransitionEnd={onTransitionEnd}
      onTitleChange={onTitleChange}
    />
  );
}

// eslint-disable-next-line max-lines-per-function
export function SpielwieseAgentNodeTitleControlContent({
  isOnboardingApiKey,
  currentModel,
  isOnboardingModelSelection,
  isModelPickerOpen,
  node,
  onModelPickerOpenChange,
  onTitleChange,
  pickerPanelProps,
}: {
  isOnboardingApiKey: boolean;
  currentModel: string;
  isOnboardingModelSelection: boolean;
  isModelPickerOpen: boolean;
  node: SpielwieseAgentNodeVM;
  onModelPickerOpenChange: (open: boolean) => void;
  onTitleChange: (nodeId: string, value: string) => void;
  pickerPanelProps: SpielwieseModelPickerProps;
}) {
  const chrome = useSpielwieseEditorCanvasChrome();
  const isOnboarding = isOnboardingChrome(chrome);
  const isOnboardingPreview = isOnboardingPreviewChrome(chrome);
  const isOnboardingPickerStep =
    isOnboardingModelSelection || isOnboardingApiKey;
  const shouldHighlightSurface = isOnboardingPickerStep || isModelPickerOpen;
  const handleSurfaceTransitionEnd = useOnboardingModelPickerHandoff({
    isModelPickerOpen,
    isOnboardingModelSelection,
    onModelPickerOpenChange,
  });

  return (
    <Popover open={isModelPickerOpen} onOpenChange={onModelPickerOpenChange}>
      <div
        className={cn(
          "relative max-w-full shrink-0",
          isModelPickerOpen && "z-40",
        )}
      >
        <SpielwieseAgentTitleControlSurface
          currentModel={currentModel}
          isOnboarding={isOnboarding}
          isOnboardingPreview={isOnboardingPreview}
          isOpen={shouldHighlightSurface}
          node={node}
          onTitleChange={onTitleChange}
          onTransitionEnd={handleSurfaceTransitionEnd}
        />
        <PopoverContent
          aria-label="Model picker"
          className={spielwieseModelPickerPanelClassName}
          data-testid="spielwiese-model-picker-panel"
          key={
            pickerPanelProps.showAnthropicApiKeyPrompt
              ? "anthropic-api-key-pane"
              : "model-picker-grid"
          }
          keepMounted={isOnboardingPickerStep}
          role="dialog"
          style={getModelPickerAnimationStyle({
            delayMs: pickerPanelProps.popoverAnimationDelayMs,
            variableName: "--spielwiese-picker-open-delay",
          })}
        >
          <SpielwieseModelPickerContents {...pickerPanelProps} />
        </PopoverContent>
      </div>
    </Popover>
  );
}
