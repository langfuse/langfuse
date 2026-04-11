import { useState } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { getNodeToolOptions } from "./SpielwieseAgentNodeToolsField";
import { SpielwieseAgentNodeHeader } from "./SpielwieseAgentNodeHeader";
import { SpielwieseMessageInsertRow } from "./SpielwieseMessageInsertRow";
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
  isCompact: boolean;
  node: SpielwieseAgentNodeVM;
  onPromptSectionDelete: SpielwieseAgentNodeStackProps["onPromptSectionDelete"];
  onPromptSectionInsert: SpielwieseAgentNodeStackProps["onPromptSectionInsert"];
  onToggleCompact: () => void;
  onPromptSectionChange: SpielwieseAgentNodeStackProps["onPromptSectionChange"];
  onPromptSectionMove: SpielwieseAgentNodeStackProps["onPromptSectionMove"];
  onSettingValueChange: SpielwieseAgentNodeStackProps["onSettingValueChange"];
  onTitleChange: SpielwieseAgentNodeStackProps["onTitleChange"];
};

const spielwieseAgentNodeShellClassName =
  "group flex w-full flex-col gap-1.5 overflow-hidden rounded-(--node-shell-radius) border border-[rgba(0,0,0,0.05)] bg-[#FBFBFB] px-[2px] pt-[2px] pb-[2px] [--node-shell-gap:2px] [--node-shell-radius:16px]";

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
    <div
      className={spielwieseAgentNodeShellClassName}
      data-testid={`${node.id}-detached-user-sections`}
    >
      <SpielwieseAgentNodePromptSections
        className="pt-0 pb-1"
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

function SpielwieseAgentNodeCard({
  isCompact,
  modelSetting,
  node,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onToggleCompact,
  onTitleChange,
  toolOptions,
}: {
  isCompact: boolean;
  modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
  node: SpielwieseAgentNodeVM;
  onPromptSectionDelete: SpielwieseAgentNodeStackProps["onPromptSectionDelete"];
  onPromptSectionInsert: SpielwieseAgentNodeStackProps["onPromptSectionInsert"];
  onPromptSectionChange: SpielwieseAgentNodeStackProps["onPromptSectionChange"];
  onPromptSectionMove: SpielwieseAgentNodeStackProps["onPromptSectionMove"];
  onSettingValueChange: SpielwieseAgentNodeStackProps["onSettingValueChange"];
  onToggleCompact: () => void;
  onTitleChange: SpielwieseAgentNodeStackProps["onTitleChange"];
  toolOptions: ReturnType<typeof getNodeToolOptions>;
}) {
  return (
    <div
      className={spielwieseAgentNodeShellClassName}
      data-testid="spielwiese-agent-node-card"
    >
      <SpielwieseAgentNodeHeader
        isCompact={isCompact}
        modelSetting={modelSetting}
        node={node}
        onToggleCompact={onToggleCompact}
        onSettingValueChange={onSettingValueChange}
        onTitleChange={onTitleChange}
      />
      <div>
        <SpielwieseAgentNodePromptSections
          includeKinds={["system", "assistant", "tool"]}
          isCompact={isCompact}
          nodeId={node.id}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionInsert={onPromptSectionInsert}
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionMove={onPromptSectionMove}
          promptSections={node.promptSections}
          toolOptions={toolOptions}
        />
      </div>
    </div>
  );
}

function SpielwieseAgentNode({
  isCompact,
  node,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onToggleCompact,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseAgentNodeProps) {
  const modelSetting = node.settings.find((setting) => setting.id === "model");
  const toolOptions = getNodeToolOptions(node.notes);

  return (
    <li className="grid gap-1.5 last:pb-5" data-testid="spielwiese-agent-node">
      <SpielwieseDetachedUserSections
        node={node}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        toolOptions={toolOptions}
      />
      <SpielwieseAgentNodeCard
        isCompact={isCompact}
        modelSetting={modelSetting}
        node={node}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        onSettingValueChange={onSettingValueChange}
        onTitleChange={onTitleChange}
        onToggleCompact={onToggleCompact}
        toolOptions={toolOptions}
      />
      <SpielwieseMessageInsertRow
        nodeId={node.id}
        onPromptSectionInsert={onPromptSectionInsert}
        rowTestId="spielwiese-message-insert-external-row"
        variant="text"
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
  const [compactNodeIds, setCompactNodeIds] = useState<Record<string, boolean>>(
    {},
  );

  return (
    <ol
      className="flex min-h-full flex-col gap-1.5 pt-4 pb-2 sm:pt-5"
      data-testid="spielwiese-agent-node-stack"
      role="list"
    >
      {nodes.map((node) => (
        <SpielwieseAgentNode
          isCompact={Boolean(compactNodeIds[node.id])}
          key={node.id}
          node={node}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionInsert={onPromptSectionInsert}
          onToggleCompact={() =>
            setCompactNodeIds((currentIds) => ({
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
