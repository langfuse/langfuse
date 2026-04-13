"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Settings2,
  Thermometer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Input } from "../ui/input";
import {
  spielwieseInlineInputClassName,
  spielwieseStripItemClassName,
  spielwieseStripItemFieldClassName,
} from "./SpielwieseHeaderStrip";
import { SpielwieseAgentNodeHeaderActions } from "./SpielwieseAgentNodeHeaderActions";
import { getNodeToolOptions } from "./SpielwieseAgentNodeToolsField";
import { SpielwieseAgentNodeTitleControl } from "./SpielwieseAgentNodeTitleControl";
import { SpielwieseToolCreatorPopup } from "./SpielwieseToolCreatorPopup";

type SpielwieseAgentNodeHeaderProps = {
  children?: ReactNode;
  isCompact: boolean;
  isPreviewFocused: boolean;
  modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
  node: SpielwieseAgentNodeVM;
  onArchiveNode: () => void;
  onPreviewHoverEnd: () => void;
  onPreviewHoverStart: () => void;
  onTogglePreviewFocus: () => void;
  onSettingValueChange: (
    nodeId: string,
    settingId: string,
    value: string,
  ) => void;
  onToggleCompact: () => void;
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
    case "top-p":
      return "w-[3rem]";
    case "stop-sequence":
      return "w-[4.25rem]";
    case "response-format":
      return "w-[4rem]";
    case "reasoning":
      return "w-[7rem]";
    default:
      return "w-[6rem]";
  }
}

function getSettingTagExpandedLabelWidthClass(settingId: string) {
  switch (settingId) {
    case "stop-sequence":
      return "max-w-[5.5rem]";
    case "response-format":
      return "max-w-[6rem]";
    case "reasoning":
      return "max-w-[4.75rem]";
    default:
      return "max-w-[4.25rem]";
  }
}

function getSettingTagExpandedWidthClass(settingId: string) {
  switch (settingId) {
    case "stop-sequence":
      return "w-[7rem]";
    case "response-format":
      return "w-[7.5rem]";
    case "reasoning":
      return "w-[6.75rem]";
    default:
      return "w-[6.5rem]";
  }
}

function getInlineSettings(settings: SpielwieseAgentNodeVM["settings"]) {
  return settings.filter(
    (setting) => setting.id !== "model" && setting.id !== "response-format",
  );
}

function getToolStripLabel(node: SpielwieseAgentNodeVM) {
  const toolOptions = getNodeToolOptions(node.notes);

  if (toolOptions.length === 0) {
    return "any";
  }

  if (toolOptions.length === 1) {
    return toolOptions[0]?.label ?? "any";
  }

  return `${toolOptions.length} tools`;
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

function useInlineSettingTagState() {
  const [isExpanded, setIsExpanded] = useState(false);

  const close = () => {
    setIsExpanded(false);
  };

  const openImmediately = () => {
    setIsExpanded(true);
  };

  return {
    close,
    isExpanded,
    openImmediately,
  };
}

const inlineSettingTagClassName =
  "border-r border-[rgba(0,0,0,0.05)] bg-[rgba(0,0,0,0.02)] text-foreground/58 flex h-full w-6 shrink-0 overflow-hidden whitespace-nowrap text-left transition-[width] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] outline-none focus-visible:ring-0";
const inlineSettingTagContentClassName =
  "flex h-full items-center gap-1 px-1.5";
const inlineSettingTagLabelClassName =
  "max-w-0 -translate-x-1 overflow-hidden opacity-0 text-[0.6875rem] font-medium transition-[max-width,opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]";

function SpielwieseInlineSettingTag({
  children,
  label,
  settingId,
}: {
  children: ReactNode;
  label: string;
  settingId: string;
}) {
  const { close, isExpanded, openImmediately } = useInlineSettingTagState();

  return (
    <button
      aria-label={`${label} setting`}
      aria-pressed={isExpanded}
      className={cn(
        inlineSettingTagClassName,
        isExpanded ? getSettingTagExpandedWidthClass(settingId) : "w-6",
      )}
      data-state={isExpanded ? "open" : "closed"}
      data-testid={`spielwiese-inline-setting-tag-${settingId}`}
      type="button"
      onBlur={close}
      onClick={openImmediately}
    >
      <span className={inlineSettingTagContentClassName}>
        {children}
        <span
          aria-hidden="true"
          className={cn(
            inlineSettingTagLabelClassName,
            isExpanded
              ? getSettingTagExpandedLabelWidthClass(settingId)
              : "max-w-0",
            isExpanded
              ? "translate-x-0 opacity-100"
              : "-translate-x-1 opacity-0",
          )}
        >
          {label}
        </span>
      </span>
    </button>
  );
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
    <dl className="flex min-w-0 shrink-0 items-center gap-1">
      {settings.flatMap((setting) => {
        const SettingIcon = getSettingIcon(setting.id);

        return [
          <dt className="sr-only" key={`${setting.id}-label`}>
            {setting.label}
          </dt>,
          <dd className={spielwieseStripItemClassName} key={setting.id}>
            <SpielwieseInlineSettingTag
              label={setting.label}
              settingId={setting.id}
            >
              <SettingIcon aria-hidden="true" className="size-3.5 shrink-0" />
            </SpielwieseInlineSettingTag>
            <Input
              aria-label={`${nodeId} ${setting.label}`}
              className={`${spielwieseInlineInputClassName} ${spielwieseStripItemFieldClassName} text-foreground/78 w-full min-w-0 text-[0.8125rem] font-medium tabular-nums max-sm:text-base/5 ${getSettingWidthClass(
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
  isCompact,
  isPreviewFocused,
  modelSetting,
  node,
  onArchiveNode,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onTogglePreviewFocus,
  onSettingValueChange,
  onToggleCompact,
  onTitleChange,
}: SpielwieseAgentNodeHeaderProps) {
  const inlineSettings = getInlineSettings(node.settings);

  return (
    <div
      className="flex w-full min-w-0 items-center justify-between gap-1.5 border-b border-black/5 bg-[rgba(251,251,251,0.82)] pt-[5px] pr-[6px] pb-[7px] pl-[6px] supports-[backdrop-filter]:bg-[rgba(251,251,251,0.72)] supports-[backdrop-filter]:backdrop-blur-md"
      data-testid="spielwiese-agent-node-header-row"
    >
      {/* Demo block: keep the header-control column visually quiet; only the trailing panel actions should advertise hover. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <SpielwieseAgentNodeTitleControl
          modelSetting={modelSetting}
          node={node}
          onSettingValueChange={onSettingValueChange}
          onTitleChange={onTitleChange}
        />
        <SpielwieseAgentNodeInlineSettings
          nodeId={node.id}
          onSettingValueChange={onSettingValueChange}
          settings={inlineSettings}
        />
        <SpielwieseToolCreatorPopup summaryLabel={getToolStripLabel(node)} />
      </div>
      <SpielwieseAgentNodeHeaderActions
        isCompact={isCompact}
        isPreviewFocused={isPreviewFocused}
        nodeId={node.id}
        onArchiveNode={onArchiveNode}
        onPreviewHoverEnd={onPreviewHoverEnd}
        onPreviewHoverStart={onPreviewHoverStart}
        onTogglePreviewFocus={onTogglePreviewFocus}
        onToggleCompact={onToggleCompact}
      />
    </div>
  );
}

export function SpielwieseAgentNodeHeader({
  children,
  ...props
}: SpielwieseAgentNodeHeaderProps) {
  return (
    <div
      className="border-border/40 flex w-full min-w-0 flex-col overflow-hidden rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] border bg-[rgba(251,251,251,0.82)] pb-[4px] supports-[backdrop-filter]:bg-[rgba(251,251,251,0.72)] supports-[backdrop-filter]:backdrop-blur-md"
      data-testid="spielwiese-agent-node-header-shell"
    >
      <SpielwieseAgentNodeHeaderRow {...props} />
      {children}
    </div>
  );
}
