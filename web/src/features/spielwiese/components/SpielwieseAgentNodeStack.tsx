import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SpielwieseAgentNodePromptSections } from "./SpielwieseAgentNodePromptSections";

type SpielwieseAgentNodeStackProps = {
  nodes: SpielwieseAgentNodeVM[];
  onPromptSectionChange: (
    nodeId: string,
    sectionId: string,
    value: string,
  ) => void;
  onSettingValueChange: (
    nodeId: string,
    settingId: string,
    value: string,
  ) => void;
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

function SpielwieseAgentNodeSettings({
  nodeId,
  onSettingValueChange,
  settings,
}: {
  nodeId: string;
  onSettingValueChange: SpielwieseAgentNodeStackProps["onSettingValueChange"];
  settings: SpielwieseAgentNodeVM["settings"];
}) {
  return (
    <dl className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {settings.map((setting) => (
        <div className="bg-muted/45 rounded-md px-2 py-1" key={setting.id}>
          <dt className="sr-only">{setting.label}</dt>
          <dd>
            <Input
              aria-label={`${nodeId} ${setting.label}`}
              className={`${inlineInputClassName} w-full min-w-0 text-[0.8125rem] font-medium tabular-nums max-sm:text-base/5 ${getSettingWidthClass(
                setting.id,
              )}`}
              name={`${nodeId}-${setting.id}`}
              onChange={(event) =>
                onSettingValueChange(nodeId, setting.id, event.target.value)
              }
              value={setting.value}
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SpielwieseAgentNodeHeader({
  isCollapsed,
  node,
  onToggleCollapse,
  onSettingValueChange,
  onTitleChange,
}: {
  isCollapsed: boolean;
  node: SpielwieseAgentNodeVM;
  onToggleCollapse: () => void;
  onSettingValueChange: SpielwieseAgentNodeStackProps["onSettingValueChange"];
  onTitleChange: SpielwieseAgentNodeStackProps["onTitleChange"];
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
        <div className="w-[10rem]">
          <Input
            aria-label={`${node.id} title`}
            className={`${inlineInputClassName} w-full min-w-0 text-sm font-semibold max-sm:text-base/5`}
            name={`${node.id}-title`}
            onChange={(event) => onTitleChange(node.id, event.target.value)}
            value={node.title}
          />
        </div>
        <SpielwieseAgentNodeSettings
          nodeId={node.id}
          onSettingValueChange={onSettingValueChange}
          settings={node.settings}
        />
        <Button
          aria-controls={`${node.id}-content`}
          aria-expanded={!isCollapsed}
          aria-label={`Toggle ${node.id} node`}
          className="ml-auto shrink-0"
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
    </div>
  );
}

function SpielwieseAgentNode({
  isCollapsed,
  node,
  onToggleCollapse,
  onPromptSectionChange,
  onSettingValueChange,
  onTitleChange,
}: {
  isCollapsed: boolean;
  node: SpielwieseAgentNodeVM;
  onToggleCollapse: () => void;
  onPromptSectionChange: SpielwieseAgentNodeStackProps["onPromptSectionChange"];
  onSettingValueChange: SpielwieseAgentNodeStackProps["onSettingValueChange"];
  onTitleChange: SpielwieseAgentNodeStackProps["onTitleChange"];
}) {
  return (
    <li data-testid="spielwiese-agent-node">
      <div className="border-border/70 bg-card/95 grid gap-2 rounded-xl border px-3 py-2">
        <SpielwieseAgentNodeHeader
          isCollapsed={isCollapsed}
          node={node}
          onToggleCollapse={onToggleCollapse}
          onSettingValueChange={onSettingValueChange}
          onTitleChange={onTitleChange}
        />
        {isCollapsed ? null : (
          <div id={`${node.id}-content`}>
            <SpielwieseAgentNodePromptSections
              nodeId={node.id}
              onPromptSectionChange={onPromptSectionChange}
              promptSections={node.promptSections}
            />
          </div>
        )}
      </div>
    </li>
  );
}

export function SpielwieseAgentNodeStack({
  nodes,
  onPromptSectionChange,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseAgentNodeStackProps) {
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<
    Record<string, boolean>
  >({});

  return (
    <ol
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-3"
      data-testid="spielwiese-agent-node-stack"
      role="list"
    >
      {nodes.map((node) => (
        <SpielwieseAgentNode
          isCollapsed={Boolean(collapsedNodeIds[node.id])}
          key={node.id}
          node={node}
          onToggleCollapse={() =>
            setCollapsedNodeIds((currentIds) => ({
              ...currentIds,
              [node.id]: !currentIds[node.id],
            }))
          }
          onPromptSectionChange={onPromptSectionChange}
          onSettingValueChange={onSettingValueChange}
          onTitleChange={onTitleChange}
        />
      ))}
    </ol>
  );
}
