import { useState } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { getNodeToolOptions } from "./SpielwieseAgentNodeToolsField";
import { SpielwieseAgentNodeHeader } from "./SpielwieseAgentNodeHeader";
import { SpielwieseAgentNodePromptSections } from "./SpielwieseAgentNodePromptSections";

type SpielwieseAgentNodeStackProps = {
  nodes: SpielwieseAgentNodeVM[];
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
  onSettingValueChange: (
    nodeId: string,
    settingId: string,
    value: string,
  ) => void;
  onTitleChange: (nodeId: string, value: string) => void;
};

type SpielwieseAgentNodeProps = {
  isCollapsed: boolean;
  node: SpielwieseAgentNodeVM;
  onPromptSectionDelete: SpielwieseAgentNodeStackProps["onPromptSectionDelete"];
  onPromptSectionInsert: SpielwieseAgentNodeStackProps["onPromptSectionInsert"];
  onToggleCollapse: () => void;
  onPromptSectionChange: SpielwieseAgentNodeStackProps["onPromptSectionChange"];
  onPromptSectionMove: SpielwieseAgentNodeStackProps["onPromptSectionMove"];
  onSettingValueChange: SpielwieseAgentNodeStackProps["onSettingValueChange"];
  onTitleChange: SpielwieseAgentNodeStackProps["onTitleChange"];
};

function SpielwieseDetachedUserSections({
  node,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  toolOptions,
}: {
  node: SpielwieseAgentNodeVM;
  onPromptSectionDelete: SpielwieseAgentNodeStackProps["onPromptSectionDelete"];
  onPromptSectionInsert: SpielwieseAgentNodeStackProps["onPromptSectionInsert"];
  onPromptSectionChange: SpielwieseAgentNodeStackProps["onPromptSectionChange"];
  onPromptSectionMove: SpielwieseAgentNodeStackProps["onPromptSectionMove"];
  toolOptions: ReturnType<typeof getNodeToolOptions>;
}) {
  return (
    <div data-testid={`${node.id}-detached-user-sections`}>
      <SpielwieseAgentNodePromptSections
        className="border-0 pt-0"
        includeKinds={["user"]}
        nodeId={node.id}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionMove={onPromptSectionMove}
        promptSections={node.promptSections}
        showInsertRow={false}
        toolOptions={toolOptions}
      />
    </div>
  );
}

function SpielwieseAgentNodeCard({
  isCollapsed,
  modelSetting,
  node,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onToggleCollapse,
  onTitleChange,
  toolOptions,
}: {
  isCollapsed: boolean;
  modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
  node: SpielwieseAgentNodeVM;
  onPromptSectionDelete: SpielwieseAgentNodeStackProps["onPromptSectionDelete"];
  onPromptSectionInsert: SpielwieseAgentNodeStackProps["onPromptSectionInsert"];
  onPromptSectionChange: SpielwieseAgentNodeStackProps["onPromptSectionChange"];
  onPromptSectionMove: SpielwieseAgentNodeStackProps["onPromptSectionMove"];
  onSettingValueChange: SpielwieseAgentNodeStackProps["onSettingValueChange"];
  onToggleCollapse: () => void;
  onTitleChange: SpielwieseAgentNodeStackProps["onTitleChange"];
  toolOptions: ReturnType<typeof getNodeToolOptions>;
}) {
  return (
    <div
      className="border-border/50 bg-card/90 grid gap-1.5 rounded-lg border px-2.5 py-2"
      data-testid="spielwiese-agent-node-card"
    >
      <SpielwieseAgentNodeHeader
        isCollapsed={isCollapsed}
        modelSetting={modelSetting}
        node={node}
        onToggleCollapse={onToggleCollapse}
        onSettingValueChange={onSettingValueChange}
        onTitleChange={onTitleChange}
      />
      {isCollapsed ? null : (
        <div id={`${node.id}-content`}>
          <SpielwieseAgentNodePromptSections
            includeKinds={["system", "assistant", "tool"]}
            nodeId={node.id}
            onPromptSectionDelete={onPromptSectionDelete}
            onPromptSectionInsert={onPromptSectionInsert}
            onPromptSectionChange={onPromptSectionChange}
            onPromptSectionMove={onPromptSectionMove}
            promptSections={node.promptSections}
            toolOptions={toolOptions}
          />
        </div>
      )}
    </div>
  );
}

function SpielwieseAgentNode({
  isCollapsed,
  node,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onToggleCollapse,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseAgentNodeProps) {
  const modelSetting = node.settings.find((setting) => setting.id === "model");
  const toolOptions = getNodeToolOptions(node.notes);

  return (
    <li className="grid gap-1.5" data-testid="spielwiese-agent-node">
      <SpielwieseDetachedUserSections
        node={node}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        toolOptions={toolOptions}
      />
      <SpielwieseAgentNodeCard
        isCollapsed={isCollapsed}
        modelSetting={modelSetting}
        node={node}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        onSettingValueChange={onSettingValueChange}
        onTitleChange={onTitleChange}
        onToggleCollapse={onToggleCollapse}
        toolOptions={toolOptions}
      />
    </li>
  );
}

export function SpielwieseAgentNodeStack({
  nodes,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseAgentNodeStackProps) {
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<
    Record<string, boolean>
  >({});

  return (
    <ol
      className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-2"
      data-testid="spielwiese-agent-node-stack"
      role="list"
    >
      {nodes.map((node) => (
        <SpielwieseAgentNode
          isCollapsed={Boolean(collapsedNodeIds[node.id])}
          key={node.id}
          node={node}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionInsert={onPromptSectionInsert}
          onToggleCollapse={() =>
            setCollapsedNodeIds((currentIds) => ({
              ...currentIds,
              [node.id]: !currentIds[node.id],
            }))
          }
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionMove={onPromptSectionMove}
          onSettingValueChange={onSettingValueChange}
          onTitleChange={onTitleChange}
        />
      ))}
    </ol>
  );
}
