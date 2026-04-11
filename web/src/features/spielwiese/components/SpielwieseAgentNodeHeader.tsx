"use client";

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
  SpielwieseHeaderStripTag,
  spielwieseInlineInputClassName,
  spielwieseStripItemClassName,
  spielwieseStripItemFieldClassName,
} from "./SpielwieseHeaderStrip";
import { getNodeToolOptions } from "./SpielwieseAgentNodeToolsField";
import { SpielwieseAgentNodeTitleControl } from "./SpielwieseAgentNodeTitleControl";
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

function getInlineSettings(settings: SpielwieseAgentNodeVM["settings"]) {
  return settings.filter((setting) => setting.id !== "model");
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
            <SpielwieseHeaderStripTag label={setting.label}>
              <SettingIcon aria-hidden="true" className="size-3.5 shrink-0" />
            </SpielwieseHeaderStripTag>
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
  isCollapsed,
  modelSetting,
  node,
  onSettingValueChange,
  onToggleCollapse,
  onTitleChange,
}: SpielwieseAgentNodeHeaderProps) {
  const inlineSettings = getInlineSettings(node.settings);

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1.5 pt-[6px] pr-2.5 pb-[6px] pl-[6px]"
      data-testid="spielwiese-agent-node-header-row"
    >
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
      <Button
        aria-controls={`${node.id}-content`}
        aria-expanded={!isCollapsed}
        aria-label={`Toggle ${node.id} node`}
        className="bg-background text-foreground/58 hover:bg-background hover:text-foreground h-7 w-7 shrink-0 rounded-[8px] border border-[rgba(0,0,0,0.08)]"
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

export function SpielwieseAgentNodeHeader(
  props: SpielwieseAgentNodeHeaderProps,
) {
  return (
    <div
      className="border-border/40 bg-background/96 flex min-w-0 items-center rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] border"
      data-testid="spielwiese-agent-node-header-shell"
    >
      <SpielwieseAgentNodeHeaderRow {...props} />
    </div>
  );
}
