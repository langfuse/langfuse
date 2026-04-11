"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  Settings2,
  Thermometer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  SpielwieseModelPickerPanel,
  SpielwieseModelPickerTrigger,
} from "./SpielwieseModelPicker";
import { SpielwieseToolCreatorPopup } from "./SpielwieseToolCreatorPopup";

type SpielwieseAgentNodeHeaderProps = {
  isCollapsed: boolean;
  modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
  node: SpielwieseAgentNodeVM;
  onSettingValueChange: (
    nodeId: string,
    settingId: string,
    value: string,
  ) => void;
  onToggleCollapse: () => void;
  onTitleChange: (nodeId: string, value: string) => void;
};

function getSettingWidthClass(settingId: string) {
  switch (settingId) {
    case "model":
      return "w-[6.75rem]";
    case "input":
      return "w-[7rem]";
    case "output":
      return "w-[7.75rem]";
    case "temperature":
      return "w-[2.75rem]";
    default:
      return "w-[6rem]";
  }
}

const inlineInputClassName =
  "h-auto rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0";
const stripItemClassName =
  "border-border/50 bg-muted/28 flex h-7 shrink-0 items-center overflow-hidden rounded-md border";
const stripItemIconRailClassName =
  "bg-muted/55 text-foreground/56 grid h-full w-6 shrink-0 place-items-center";
const stripItemFieldClassName = "min-w-0 px-2";

function getInlineSettings(settings: SpielwieseAgentNodeVM["settings"]) {
  return settings.filter((setting) => setting.id !== "model");
}

function getSettingIcon(settingId: string): LucideIcon {
  switch (settingId) {
    case "input":
      return ArrowDownToLine;
    case "output":
      return ArrowUpToLine;
    case "temperature":
      return Thermometer;
    default:
      return Settings2;
  }
}

function SpielwieseAgentNodeInlineSettings({
  nodeId,
  onSettingValueChange,
  settings,
}: {
  nodeId: string;
  onSettingValueChange: SpielwieseAgentNodeHeaderProps["onSettingValueChange"];
  settings: SpielwieseAgentNodeVM["settings"];
}) {
  return (
    <dl className="flex min-w-0 flex-wrap items-center gap-1">
      {settings.flatMap((setting) => {
        const SettingIcon = getSettingIcon(setting.id);

        return [
          <dt className="sr-only" key={`${setting.id}-label`}>
            {setting.label}
          </dt>,
          <dd className={stripItemClassName} key={setting.id}>
            <span className={stripItemIconRailClassName}>
              <SettingIcon aria-hidden="true" className="size-3.5" />
            </span>
            <Input
              aria-label={`${nodeId} ${setting.label}`}
              className={`${inlineInputClassName} ${stripItemFieldClassName} text-foreground/78 w-full min-w-0 text-[0.8125rem] font-medium tabular-nums max-sm:text-base/5 ${getSettingWidthClass(
                setting.id,
              )}`}
              name={`${nodeId}-${setting.id}`}
              onChange={(event) =>
                onSettingValueChange(nodeId, setting.id, event.target.value)
              }
              value={setting.value}
            />
          </dd>,
        ];
      })}
    </dl>
  );
}

function SpielwieseAgentNodeHeaderRow({
  isCollapsed,
  modelSetting,
  node,
  onSettingValueChange,
  onToggleCollapse,
  onTitleChange,
}: SpielwieseAgentNodeHeaderProps) {
  const inlineSettings = getInlineSettings(node.settings);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <div className="min-w-0 flex-1 basis-[10rem]">
        <Input
          aria-label={`${node.id} title`}
          className={`${inlineInputClassName} w-full min-w-0 text-[13px] font-semibold tracking-[-0.01em] max-sm:text-base/5`}
          name={`${node.id}-title`}
          onChange={(event) => onTitleChange(node.id, event.target.value)}
          value={node.title}
        />
      </div>
      <SpielwieseAgentNodeModelControl
        modelSetting={modelSetting}
        node={node}
        onSettingValueChange={onSettingValueChange}
      />
      <SpielwieseAgentNodeInlineSettings
        nodeId={node.id}
        onSettingValueChange={onSettingValueChange}
        settings={inlineSettings}
      />
      <SpielwieseToolCreatorPopup />
      <Button
        aria-controls={`${node.id}-content`}
        aria-expanded={!isCollapsed}
        aria-label={`Toggle ${node.id} node`}
        className="text-foreground/55 hover:bg-muted/45 hover:text-foreground ml-auto h-7 w-7 shrink-0 rounded-md"
        size="icon-sm"
        variant="ghost"
        onClick={onToggleCollapse}
      >
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform",
            isCollapsed && "-rotate-90",
          )}
        />
      </Button>
    </div>
  );
}

function resetModelPickerState({
  setHoveredModelLabel,
  setProviderId,
  setShowLegacyModels,
}: {
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
  setShowLegacyModels: (value: boolean) => void;
}) {
  setProviderId(null);
  setHoveredModelLabel(null);
  setShowLegacyModels(false);
}

function useModelPickerControlState() {
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [hoveredModelLabel, setHoveredModelLabel] = useState<string | null>(
    null,
  );
  const [showLegacyModels, setShowLegacyModels] = useState(false);

  const resetState = () =>
    resetModelPickerState({
      setHoveredModelLabel,
      setProviderId,
      setShowLegacyModels,
    });
  const closePicker = () => {
    setIsModelPickerOpen(false);
    resetState();
  };

  return {
    closePicker,
    hoveredModelLabel,
    isModelPickerOpen,
    providerId,
    setHoveredModelLabel,
    setProviderId,
    setShowLegacyModels,
    showLegacyModels,
    togglePicker: () =>
      setIsModelPickerOpen((currentValue) => {
        if (currentValue) {
          resetState();
        }

        return !currentValue;
      }),
  };
}

type SpielwieseAgentNodeModelControlProps = {
  modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
  node: SpielwieseAgentNodeVM;
  onSettingValueChange: SpielwieseAgentNodeHeaderProps["onSettingValueChange"];
};

function SpielwieseAgentNodeModelControl({
  modelSetting,
  node,
  onSettingValueChange,
}: SpielwieseAgentNodeModelControlProps) {
  const {
    closePicker,
    hoveredModelLabel,
    isModelPickerOpen,
    providerId,
    setHoveredModelLabel,
    setProviderId,
    setShowLegacyModels,
    showLegacyModels,
    togglePicker,
  } = useModelPickerControlState();
  if (!modelSetting) {
    return null;
  }
  return (
    <div
      className="relative shrink-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          closePicker();
        }
      }}
    >
      <SpielwieseModelPickerTrigger
        ariaLabel={`${node.id} ${modelSetting.label}`}
        currentModel={modelSetting.value}
        isOpen={isModelPickerOpen}
        onClick={togglePicker}
      />
      {isModelPickerOpen ? (
        <SpielwieseModelPickerPanel
          currentModel={modelSetting.value}
          hoveredModelLabel={hoveredModelLabel}
          onClose={closePicker}
          onValueChange={(value) =>
            onSettingValueChange(node.id, modelSetting.id, value)
          }
          providerId={providerId}
          setHoveredModelLabel={setHoveredModelLabel}
          setProviderId={setProviderId}
          setShowLegacyModels={setShowLegacyModels}
          showLegacyModels={showLegacyModels}
        />
      ) : null}
    </div>
  );
}

export function SpielwieseAgentNodeHeader({
  isCollapsed,
  modelSetting,
  node,
  onSettingValueChange,
  onToggleCollapse,
  onTitleChange,
}: SpielwieseAgentNodeHeaderProps) {
  return (
    <SpielwieseAgentNodeHeaderRow
      isCollapsed={isCollapsed}
      modelSetting={modelSetting}
      node={node}
      onSettingValueChange={onSettingValueChange}
      onToggleCollapse={onToggleCollapse}
      onTitleChange={onTitleChange}
    />
  );
}
