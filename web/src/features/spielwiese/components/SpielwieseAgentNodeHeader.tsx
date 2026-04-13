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
import { spielwieseAgentNodeHeaderSurfaceStyle } from "./spielwieseAgentNodeColorPalette";
import { SpielwieseAgentNodeHeaderActions } from "./SpielwieseAgentNodeHeaderActions";
import {
  isOnboardingChrome,
  useSpielwieseEditorCanvasChrome,
} from "./SpielwieseEditorCanvasChromeContext";
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
  "border-r border-[color:var(--spielwiese-agent-node-chrome-border)] bg-[rgba(0,0,0,0.02)] text-foreground/58 flex h-full w-6 shrink-0 overflow-hidden whitespace-nowrap text-left transition-[width] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] outline-none focus-visible:ring-0";
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
              className={cn(
                spielwieseInlineInputClassName,
                spielwieseStripItemFieldClassName,
                "text-foreground/78 [field-sizing:content] w-auto max-w-[10rem] min-w-[1ch] text-[0.8125rem] font-medium tabular-nums max-sm:text-base/5 sm:max-w-[12rem]",
              )}
              name={`${nodeId}-${setting.id}`}
              onChange={(event) =>
                onSettingValueChange(nodeId, setting.id, event.target.value)
              }
              size={Math.max(setting.value.length, 1)}
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
  const chrome = useSpielwieseEditorCanvasChrome();
  const isOnboardingPreview = isOnboardingChrome(chrome);
  const inlineSettings = getInlineSettings(node.settings);

  return (
    <div
      className="flex w-full min-w-0 items-center justify-between gap-1.5 border-b border-[color:var(--spielwiese-agent-node-header-divider)] bg-[var(--spielwiese-agent-node-header-active-surface)] pt-[5px] pr-[6px] pb-[7px] pl-[6px]"
      data-testid="spielwiese-agent-node-header-row"
      style={spielwieseAgentNodeHeaderSurfaceStyle}
    >
      {/* Demo block: keep the header-control column visually quiet; only the trailing panel actions should advertise hover. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <SpielwieseAgentNodeTitleControl
          modelSetting={modelSetting}
          node={node}
          onSettingValueChange={onSettingValueChange}
          onTitleChange={onTitleChange}
        />
        {isOnboardingPreview ? null : (
          <SpielwieseAgentNodeInlineSettings
            nodeId={node.id}
            onSettingValueChange={onSettingValueChange}
            settings={inlineSettings}
          />
        )}
        {isOnboardingPreview ? null : (
          <SpielwieseToolCreatorPopup summaryLabel={getToolStripLabel(node)} />
        )}
      </div>
      {isOnboardingPreview ? null : (
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
      )}
    </div>
  );
}

export function SpielwieseAgentNodeHeader({
  children,
  ...props
}: SpielwieseAgentNodeHeaderProps) {
  return (
    <div
      className="flex w-full min-w-0 flex-col overflow-hidden rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] border border-[color:var(--spielwiese-agent-node-chrome-border)] bg-[var(--spielwiese-agent-node-header-active-surface)] pb-[4px]"
      data-testid="spielwiese-agent-node-header-shell"
      style={spielwieseAgentNodeHeaderSurfaceStyle}
    >
      <SpielwieseAgentNodeHeaderRow {...props} />
      {children}
    </div>
  );
}
