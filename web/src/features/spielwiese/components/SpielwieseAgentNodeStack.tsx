import { useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { cn } from "@/src/utils/tailwind";
import { getNodeToolOptions } from "./SpielwieseAgentNodeToolsField";
import { SpielwieseAgentNodeHeader } from "./SpielwieseAgentNodeHeader";
import { SpielwieseMessageInsertRow } from "./SpielwieseMessageInsertRow";
import { SpielwieseAgentNodePromptSections } from "./SpielwieseAgentNodePromptSections";
import { Button } from "../ui/button";

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
  "group flex w-full flex-col gap-1.5 overflow-visible rounded-(--node-shell-radius) border border-[rgba(0,0,0,0.05)] bg-[#FBFBFB] px-[2px] pt-[2px] pb-[2px] [--node-shell-gap:2px] [--node-shell-radius:16px]";
const spielwieseAgentNodeCardNavButtonClassName =
  "bg-background text-foreground/52 hover:bg-background hover:text-foreground h-8 w-8 shrink-0 rounded-[10px] border border-[rgba(0,0,0,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] disabled:opacity-38";

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
      className={cn(spielwieseAgentNodeShellClassName, "overflow-visible")}
      data-testid={`${node.id}-detached-user-sections`}
    >
      <SpielwieseAgentNodePromptSections
        className="pt-0 pb-0"
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

function SpielwieseEmptyAgentNodeCard() {
  return (
    <div
      className={spielwieseAgentNodeShellClassName}
      data-testid="spielwiese-agent-node-empty-card"
    >
      <div className="border-border/40 bg-background/96 flex min-w-0 items-center rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] border">
        <div className="flex w-full min-w-0 items-center pt-[6px] pr-2.5 pb-[6px] pl-[10px]">
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/52">
            New step
          </span>
        </div>
      </div>
      <div className="border-border/40 bg-[rgba(255,255,255,0.82)] flex min-h-[8.5rem] items-center rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] border border-dashed px-4 py-5">
        <div className="flex max-w-[16rem] flex-col gap-1.5">
          <p className="text-[13px] font-medium tracking-[-0.01em] text-foreground/64">
            Blank card
          </p>
          <p className="text-[12px] leading-5 text-foreground/42">
            This card starts empty, with no settings yet.
          </p>
        </div>
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
  const [activeCardView, setActiveCardView] = useState<"primary" | "secondary">(
    "primary",
  );
  const modelSetting = node.settings.find((setting) => setting.id === "model");
  const toolOptions = getNodeToolOptions(node.notes);
  const isSecondaryCardActive = activeCardView === "secondary";

  return (
    <li
      className="group/agent-node grid gap-1.5 last:pb-5"
      data-testid="spielwiese-agent-node"
    >
      <SpielwieseDetachedUserSections
        node={node}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        toolOptions={toolOptions}
      />
      <div className="flex min-w-0 items-center gap-1.5">
        <Button
          aria-label={`Show previous card for ${node.id}`}
          className={spielwieseAgentNodeCardNavButtonClassName}
          data-testid="spielwiese-agent-node-card-back-button"
          disabled={!isSecondaryCardActive}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={() => setActiveCardView("primary")}
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <div
          className={cn(
            "min-w-0 flex-1",
            isSecondaryCardActive ? "overflow-hidden" : "overflow-visible",
          )}
          data-testid="spielwiese-agent-node-card-viewport"
        >
          <div
            className={cn(
              "flex transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
              isSecondaryCardActive ? "-translate-x-full" : "translate-x-0",
            )}
            data-testid="spielwiese-agent-node-card-track"
          >
            <div
              aria-hidden={isSecondaryCardActive}
              className={cn(
                "min-w-full shrink-0 transition-opacity duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
                isSecondaryCardActive
                  ? "pointer-events-none opacity-0"
                  : "opacity-100",
              )}
            >
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
            </div>
            <div
              aria-hidden={!isSecondaryCardActive}
              className={cn(
                "min-w-full shrink-0 transition-opacity duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
                isSecondaryCardActive
                  ? "opacity-100"
                  : "pointer-events-none opacity-0",
              )}
            >
              <SpielwieseEmptyAgentNodeCard />
            </div>
          </div>
        </div>
        <Button
          aria-label={`Add a new card after ${node.id}`}
          className={spielwieseAgentNodeCardNavButtonClassName}
          data-testid="spielwiese-agent-node-card-add-button"
          disabled={isSecondaryCardActive}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={() => setActiveCardView("secondary")}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      {isSecondaryCardActive ? null : (
        <SpielwieseMessageInsertRow
          className="pointer-events-none opacity-0 transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-focus-within/agent-node:pointer-events-auto group-focus-within/agent-node:opacity-100 group-hover/agent-node:pointer-events-auto group-hover/agent-node:opacity-100"
          nodeId={node.id}
          onPromptSectionInsert={onPromptSectionInsert}
          rowTestId="spielwiese-message-insert-external-row"
          variant="text"
        />
      )}
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
