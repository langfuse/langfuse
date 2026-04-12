"use client";

import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Input } from "../ui/input";
import { getModelDisplayLabel } from "./spielwieseModelCatalog";
import { SpielwieseModelProviderMark } from "./SpielwieseModelProviderMark";
import {
  SpielwieseHeaderStripTag,
  spielwieseInlineInputClassName,
  spielwieseStripItemFieldClassName,
} from "./SpielwieseHeaderStrip";
import { TitleControlModelPickerPortal } from "./SpielwieseAgentNodeTitleControlModelPickerPortal";
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
          "text-foreground [field-sizing:content] w-auto max-w-[14rem] min-w-[1ch] px-0 text-[13px] font-semibold tracking-[-0.01em] max-sm:text-base/5 sm:max-w-[18rem]",
        )}
        name={`${node.id}-title`}
        onChange={(event) => onTitleChange(node.id, event.target.value)}
        size={Math.max(node.title.length, 1)}
        value={node.title}
      />
    </div>
  );
}

function SpielwieseAgentModelSegment({
  nodeId,
  currentModel,
  isOpen,
  onClick,
}: {
  nodeId: string;
  currentModel: string;
  isOpen: boolean;
  onClick: () => void;
}) {
  const displayModelLabel = getModelDisplayLabel(currentModel);

  return (
    <div className="flex shrink-0 items-center pr-1">
      <button
        aria-expanded={isOpen}
        aria-label={`${nodeId} Model`}
        className="text-foreground inline-flex h-7 w-auto max-w-[14rem] shrink-0 items-center gap-2 rounded-none border-0 bg-transparent px-0 text-[13px] font-medium whitespace-nowrap outline-none hover:bg-transparent focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 sm:max-w-[18rem]"
        type="button"
        onClick={onClick}
      >
        <span className="inline-flex min-w-0 items-center">
          <SpielwieseHeaderStripTag
            className="bg-transparent"
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
          className="text-foreground/36 size-3 shrink-0 stroke-[2.2px]"
        />
      </button>
    </div>
  );
}

function SpielwieseAgentTitleSurface({
  currentModel,
  isModelPickerOpen,
  node,
  onTitleChange,
  togglePicker,
}: {
  currentModel: string;
  isModelPickerOpen: boolean;
  node: SpielwieseAgentNodeVM;
  onTitleChange: (nodeId: string, value: string) => void;
  togglePicker: () => void;
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
        nodeId={node.id}
        currentModel={currentModel}
        isOpen={isModelPickerOpen}
        onClick={togglePicker}
      />
      <div className="w-px shrink-0 self-stretch bg-black/8" />
      <SpielwieseAgentTitleField node={node} onTitleChange={onTitleChange} />
    </div>
  );
}

export function SpielwieseAgentNodeTitleControlContent({
  currentModel,
  handlePickerBlur,
  handleTogglePicker,
  isModelPickerOpen,
  node,
  onTitleChange,
  pickerProps,
  titleControlRef,
}: {
  currentModel: string;
  handlePickerBlur: ComponentProps<"div">["onBlur"];
  handleTogglePicker: () => void;
  isModelPickerOpen: boolean;
  node: SpielwieseAgentNodeVM;
  onTitleChange: (nodeId: string, value: string) => void;
  pickerProps: ComponentProps<typeof TitleControlModelPickerPortal>;
  titleControlRef: ComponentProps<"div">["ref"];
}) {
  return (
    <div
      ref={titleControlRef}
      className={cn(
        "relative max-w-full shrink-0",
        isModelPickerOpen && "z-40",
      )}
      onBlur={handlePickerBlur}
    >
      <SpielwieseAgentTitleSurface
        currentModel={currentModel}
        isModelPickerOpen={isModelPickerOpen}
        node={node}
        onTitleChange={onTitleChange}
        togglePicker={handleTogglePicker}
      />
      <TitleControlModelPickerPortal {...pickerProps} />
    </div>
  );
}
