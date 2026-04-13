import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import {
  SpielwieseAgentNodePreviewSpotlight,
  useSpielwieseAgentNodeFocusMode,
} from "./SpielwieseAgentNodeFocusMode";
import {
  isOnboardingChrome,
  useSpielwieseEditorCanvasChrome,
} from "./SpielwieseEditorCanvasChromeContext";
import { SpielwieseAgentNodeHandoffConnector } from "./SpielwieseAgentNodeHandoffConnector";
import { SpielwieseFocusedAgentNodeModal } from "./SpielwieseFocusedAgentNodeModal";
import { SpielwieseAgentNodeItem } from "./SpielwieseAgentNodeItem";

type SpielwieseAgentNodeStackProps = {
  compactNodeIds: Record<string, boolean>;
  listClassName?: string;
  nodes: SpielwieseAgentNodeVM[];
  onAgentNodeArchive: (nodeId: string) => void;
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
  onToggleCompact: (nodeId: string) => void;
  onTitleChange: (nodeId: string, value: string) => void;
};

type SpielwieseAgentNodeListProps = {
  listClassName?: string;
  compactNodeIds: Record<string, boolean>;
  focusMode: ReturnType<typeof useSpielwieseAgentNodeFocusMode>;
  nodes: SpielwieseAgentNodeVM[];
  onAgentNodeArchive: SpielwieseAgentNodeStackProps["onAgentNodeArchive"];
  onPromptSectionChange: SpielwieseAgentNodeStackProps["onPromptSectionChange"];
  onPromptSectionDelete: SpielwieseAgentNodeStackProps["onPromptSectionDelete"];
  onPromptSectionInsert: SpielwieseAgentNodeStackProps["onPromptSectionInsert"];
  onPromptSectionMove: SpielwieseAgentNodeStackProps["onPromptSectionMove"];
  onSettingValueChange: SpielwieseAgentNodeStackProps["onSettingValueChange"];
  onTitleChange: SpielwieseAgentNodeStackProps["onTitleChange"];
  onToggleCompact: (nodeId: string) => void;
};

function renderAgentNodeItems({
  compactNodeIds,
  focusMode,
  nodes,
  onAgentNodeArchive,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
  onToggleCompact,
}: Omit<SpielwieseAgentNodeListProps, "listClassName">) {
  return nodes.flatMap((node, index) => {
    const nextNode = nodes[index + 1];

    return [
      <SpielwieseAgentNodeItem
        isCompact={Boolean(compactNodeIds[node.id])}
        isPreviewFocused={focusMode.focusedNodeId === node.id}
        isPreviewFocusHidden={focusMode.focusedNodeId === node.id}
        isPreviewSpotlighted={focusMode.hoveredPreviewNodeId === node.id}
        key={node.id}
        node={node}
        onAgentNodeArchive={onAgentNodeArchive}
        onPreviewHoverEnd={() => focusMode.handlePreviewHoverEnd(node.id)}
        onPreviewHoverStart={() => focusMode.handlePreviewHoverStart(node.id)}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        onRegisterPreviewRegion={focusMode.getPreviewRegionRef(node.id)}
        onSettingValueChange={onSettingValueChange}
        onTitleChange={onTitleChange}
        onToggleCompact={() => onToggleCompact(node.id)}
        onTogglePreviewFocus={() => focusMode.togglePreviewFocus(node.id)}
      />,
      nextNode ? (
        <SpielwieseAgentNodeHandoffConnector
          key={`${node.id}-${nextNode.id}-connector`}
          priorNodes={nodes.slice(0, index)}
          sourceNode={node}
          targetNode={nextNode}
        />
      ) : null,
    ];
  });
}

function SpielwieseAgentNodeList({
  listClassName,
  compactNodeIds,
  focusMode,
  nodes,
  onAgentNodeArchive,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
  onToggleCompact,
}: SpielwieseAgentNodeListProps) {
  const chrome = useSpielwieseEditorCanvasChrome();
  const isOnboarding = isOnboardingChrome(chrome);

  return (
    <ol
      className={cn(
        isOnboarding
          ? "relative isolate flex flex-col gap-1.5 pt-2 pb-0"
          : "relative isolate flex min-h-full flex-col gap-1.5 pt-4 pb-2 sm:pt-5",
        listClassName,
      )}
      data-testid="spielwiese-agent-node-stack"
      role="list"
    >
      {renderAgentNodeItems({
        compactNodeIds,
        focusMode,
        nodes,
        onAgentNodeArchive,
        onPromptSectionChange,
        onPromptSectionDelete,
        onPromptSectionInsert,
        onPromptSectionMove,
        onSettingValueChange,
        onTitleChange,
        onToggleCompact,
      })}
    </ol>
  );
}

export function SpielwieseAgentNodeStack({
  compactNodeIds,
  listClassName,
  nodes,
  onAgentNodeArchive,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onToggleCompact,
  onTitleChange,
}: SpielwieseAgentNodeStackProps) {
  const focusMode = useSpielwieseAgentNodeFocusMode(nodes);
  const chrome = useSpielwieseEditorCanvasChrome();
  const isOnboarding = isOnboardingChrome(chrome);

  return (
    <>
      <SpielwieseAgentNodeList
        listClassName={listClassName}
        compactNodeIds={compactNodeIds}
        focusMode={focusMode}
        nodes={nodes}
        onAgentNodeArchive={onAgentNodeArchive}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        onSettingValueChange={onSettingValueChange}
        onToggleCompact={onToggleCompact}
        onTitleChange={onTitleChange}
      />
      <SpielwieseAgentNodePreviewSpotlight
        frame={focusMode.activePreviewSpotlightFrame}
      />
      {!isOnboarding ? (
        <SpielwieseFocusedAgentNodeModal
          compactNodeIds={compactNodeIds}
          focusMode={focusMode}
          onAgentNodeArchive={onAgentNodeArchive}
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionInsert={onPromptSectionInsert}
          onPromptSectionMove={onPromptSectionMove}
          onSettingValueChange={onSettingValueChange}
          onToggleCompact={onToggleCompact}
          onTitleChange={onTitleChange}
        />
      ) : null}
    </>
  );
}
