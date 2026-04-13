import type { SpielwieseDashboardVM } from "../types/dashboard";
import { SpielwieseAgentNodeExternalInsertRow } from "./SpielwieseAgentNodeExternalInsertRow";
import { SpielwieseAgentNodeStack } from "./SpielwieseAgentNodeStack";

type SpielwieseCanvasPaneBuilderProps = {
  compactNodeIds: Record<string, boolean>;
  insertAnchorNodeId: string | null;
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
  onAgentNodeArchive: (nodeId: string) => void;
  onAgentNodeInsert: (nodeId: string, kind: "user" | "agent") => void;
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

export function SpielwieseCanvasPaneBuilder({
  compactNodeIds,
  insertAnchorNodeId,
  nodes,
  onAgentNodeArchive,
  onAgentNodeInsert,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onToggleCompact,
  onTitleChange,
}: SpielwieseCanvasPaneBuilderProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <SpielwieseAgentNodeStack
          compactNodeIds={compactNodeIds}
          listClassName="pt-2 pb-2 sm:pt-2"
          nodes={nodes}
          onAgentNodeArchive={onAgentNodeArchive}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionInsert={onPromptSectionInsert}
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionMove={onPromptSectionMove}
          onSettingValueChange={onSettingValueChange}
          onToggleCompact={onToggleCompact}
          onTitleChange={onTitleChange}
        />
      </div>
      {insertAnchorNodeId ? (
        <div
          className="flex-none"
          data-testid="spielwiese-agent-node-insert-footer"
        >
          <SpielwieseAgentNodeExternalInsertRow
            nodeId={insertAnchorNodeId}
            onAgentNodeInsert={onAgentNodeInsert}
          />
        </div>
      ) : null}
    </div>
  );
}
