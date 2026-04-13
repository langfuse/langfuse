import type { SpielwieseDashboardVM } from "../types/dashboard";
import { SpielwieseAgentNodeExternalInsertRow } from "./SpielwieseAgentNodeExternalInsertRow";
import { SpielwieseAgentNodeStack } from "./SpielwieseAgentNodeStack";
import { spielwieseCanvasPaneFooterClassName } from "./spielwieseCanvasPaneChrome";

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
  showFooterInsert?: boolean;
  onToggleCompact: (nodeId: string) => void;
  onTitleChange: (nodeId: string, value: string) => void;
};

function SpielwieseCanvasPaneEmptyState({
  insertAnchorNodeId,
  onAgentNodeInsert,
}: Pick<
  SpielwieseCanvasPaneBuilderProps,
  "insertAnchorNodeId" | "onAgentNodeInsert"
>) {
  return (
    <div
      className="flex min-h-full items-center justify-center px-6 py-10"
      data-testid="spielwiese-agent-node-empty-state"
    >
      <div className="flex max-w-[20rem] flex-col items-center gap-4 text-center">
        <p className="text-foreground/56 text-sm font-medium tracking-[-0.01em]">
          Get started building your agents
        </p>
        {insertAnchorNodeId ? (
          <SpielwieseAgentNodeExternalInsertRow
            nodeId={insertAnchorNodeId}
            onAgentNodeInsert={onAgentNodeInsert}
            variant="pane-footer"
          />
        ) : null}
      </div>
    </div>
  );
}

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
  showFooterInsert = true,
  onToggleCompact,
  onTitleChange,
}: SpielwieseCanvasPaneBuilderProps) {
  const isEmptyCanvas = nodes.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {isEmptyCanvas ? (
          <SpielwieseCanvasPaneEmptyState
            insertAnchorNodeId={insertAnchorNodeId}
            onAgentNodeInsert={onAgentNodeInsert}
          />
        ) : (
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
        )}
      </div>
      {showFooterInsert && insertAnchorNodeId ? (
        <div
          className={spielwieseCanvasPaneFooterClassName}
          data-testid="spielwiese-agent-node-insert-footer"
        >
          <SpielwieseAgentNodeExternalInsertRow
            nodeId={insertAnchorNodeId}
            onAgentNodeInsert={onAgentNodeInsert}
            variant="pane-footer"
          />
        </div>
      ) : null}
    </div>
  );
}
