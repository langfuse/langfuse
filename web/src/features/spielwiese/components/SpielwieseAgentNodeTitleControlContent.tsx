"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { getModelDisplayLabel } from "./spielwieseModelCatalog";
import {
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
  nodeId,
}: {
  currentModel: string;
  isDisabled?: boolean;
  nodeId: string;
}) {
  const displayModelLabel = getModelDisplayLabel(currentModel);

  return (
    <div className="flex shrink-0 items-center pr-1">
      <PopoverTrigger
        aria-label={`${nodeId} Model`}
        className={cn(
          "inline-flex h-7 w-auto max-w-[14rem] shrink-0 items-center gap-2 rounded-none border-0 bg-transparent px-0 text-[13px] font-medium whitespace-nowrap outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-100 sm:max-w-[18rem]",
          isDisabled ? "text-foreground/42" : "text-foreground",
        )}
        disabled={isDisabled}
      >
        <span className="inline-flex min-w-0 items-center">
          <SpielwieseHeaderStripTag
            className={cn("bg-transparent", isDisabled && "opacity-55")}
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
            "size-3 shrink-0 stroke-[2.2px]",
            isDisabled ? "text-foreground/24" : "text-foreground/36",
          )}
        />
      </PopoverTrigger>
    </div>
  );
}

function SpielwieseAgentTitleSurface({
  currentModel,
  node,
  onTitleChange,
}: {
  currentModel: string;
  node: SpielwieseAgentNodeVM;
  onTitleChange: (nodeId: string, value: string) => void;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-7 max-w-full items-center overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-black/4",
        getModelTintClassName(currentModel),
      )}
      data-testid="spielwiese-agent-title-control"
    >
      <SpielwieseAgentModelSegment
        currentModel={currentModel}
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
  node,
}: {
  currentModel: string;
  isMuted?: boolean;
  node: SpielwieseAgentNodeVM;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-7 max-w-full items-center overflow-hidden rounded-[10px] border shadow-none ring-1",
        isMuted
          ? "border-[rgba(0,0,0,0.05)] bg-[rgba(247,247,248,0.96)] ring-black/3 opacity-75"
          : "border-[rgba(0,0,0,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-black/4",
        getModelTintClassName(currentModel),
      )}
      data-testid="spielwiese-agent-title-control"
    >
      <SpielwieseAgentModelSegment
        currentModel={currentModel}
        isDisabled={isMuted}
        nodeId={node.id}
      />
    </div>
  );
}

export function SpielwieseAgentNodeTitleControlContent({
  currentModel,
  isModelPickerOpen,
  node,
  onModelPickerOpenChange,
  onTitleChange,
  pickerPanelProps,
}: {
  currentModel: string;
  isModelPickerOpen: boolean;
  node: SpielwieseAgentNodeVM;
  onModelPickerOpenChange: (open: boolean) => void;
  onTitleChange: (nodeId: string, value: string) => void;
  pickerPanelProps: SpielwieseModelPickerProps;
}) {
  const chrome = useSpielwieseEditorCanvasChrome();
  const isOnboarding = isOnboardingChrome(chrome);
  const isOnboardingPreview = isOnboardingPreviewChrome(chrome);

  return (
    <Popover open={isModelPickerOpen} onOpenChange={onModelPickerOpenChange}>
      <div
        className={cn(
          "relative max-w-full shrink-0",
          isModelPickerOpen && "z-40",
        )}
      >
        {isOnboarding ? (
          <SpielwieseAgentModelOnlySurface
            currentModel={currentModel}
            isMuted={isOnboardingPreview}
            node={node}
          />
        ) : (
          <SpielwieseAgentTitleSurface
            currentModel={currentModel}
            node={node}
            onTitleChange={onTitleChange}
          />
        )}
        <PopoverContent
          aria-label="Model picker"
          className={spielwieseModelPickerPanelClassName}
          data-testid="spielwiese-model-picker-panel"
          role="dialog"
        >
          <SpielwieseModelPickerContents {...pickerPanelProps} />
        </PopoverContent>
      </div>
    </Popover>
  );
}
