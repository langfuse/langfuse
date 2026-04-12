import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import { useOptionalSpielwieseShell } from "../shell/SpielwieseShellProvider";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import { SpielwieseAgentNodeExternalInsertRow } from "./SpielwieseAgentNodeExternalInsertRow";
import { SpielwieseNodeActionButtons } from "./SpielwieseAgentNodeHeaderActions";
import { SpielwieseAgentNodeStack } from "./SpielwieseAgentNodeStack";
import {
  formatEditableCanvasNodes,
  parseEditableCanvasNodes,
} from "./spielwieseEditableCanvasJson";
import type { CanvasEditorMode } from "./spielwieseCanvasPaneEditorMode";
import {
  CanvasEditorModeToggle,
  CanvasJsonEditor,
} from "./spielwieseCanvasPaneEditorMode";

export type SpielwieseCanvasPaneProps = {
  className?: string;
  insertAnchorNodeId: string | null;
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
  onNodesReplace: (
    nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  ) => void;
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
  onTitleChange: (nodeId: string, value: string) => void;
};

function getCanvasNodesSignature(
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
) {
  return JSON.stringify(nodes);
}

function commitCanvasJsonDraft({
  draft,
  onNodesReplace,
}: {
  draft: string;
  onNodesReplace: SpielwieseCanvasPaneProps["onNodesReplace"];
}) {
  const parsedResult = parseEditableCanvasNodes(draft);

  if (!parsedResult.ok) {
    return parsedResult;
  }

  onNodesReplace(parsedResult.nodes);

  return {
    formattedDraft: formatEditableCanvasNodes(parsedResult.nodes),
    ok: true as const,
  };
}

function useCanvasJsonDraftState(
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
) {
  const sourceSignature = getCanvasNodesSignature(nodes);
  const [draftState, setDraftState] = useState(() => ({
    draft: formatEditableCanvasNodes(nodes),
    error: null as string | null,
    mode: "builder" as CanvasEditorMode,
    sourceSignature,
  }));

  if (draftState.sourceSignature !== sourceSignature) {
    setDraftState((currentState) => ({
      ...currentState,
      draft: formatEditableCanvasNodes(nodes),
      error: null,
      sourceSignature,
    }));
  }

  return {
    draftState,
    setDraftState,
  };
}

function getCanvasJsonDraftError(value: string) {
  return parseEditableCanvasNodes(value).ok
    ? null
    : "Invalid JSON. Fix the structure before switching back.";
}

function useCanvasJsonEditorState({
  nodes,
  onNodesReplace,
}: Pick<SpielwieseCanvasPaneProps, "nodes" | "onNodesReplace">) {
  const { draftState, setDraftState } = useCanvasJsonDraftState(nodes);

  const tryCommitDraft = (draft: string) => {
    const commitResult = commitCanvasJsonDraft({
      draft,
      onNodesReplace,
    });

    if (!commitResult.ok) {
      setDraftState((currentState) => ({
        ...currentState,
        error: commitResult.error,
      }));

      return false;
    }

    setDraftState((currentState) => ({
      ...currentState,
      draft: commitResult.formattedDraft,
      error: null,
    }));

    return true;
  };

  return {
    draft: draftState.draft,
    error: draftState.error,
    mode: draftState.mode,
    onDraftBlur: () => {
      void tryCommitDraft(draftState.draft);
    },
    onDraftChange: (value: string) =>
      setDraftState((currentState) => ({
        ...currentState,
        draft: value,
        error: getCanvasJsonDraftError(value),
      })),
    onModeChange: (mode: CanvasEditorMode) => {
      if (mode === "builder" && draftState.mode === "json") {
        const didCommitDraft = tryCommitDraft(draftState.draft);

        if (!didCommitDraft) {
          return;
        }
      }

      setDraftState((currentState) => ({
        ...currentState,
        mode,
      }));
    },
  };
}

function getAllCompactNodeIds(
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  isCompact: boolean,
) {
  return Object.fromEntries(
    nodes.map((node) => [node.id, isCompact] as const),
  ) as Record<string, boolean>;
}

function CanvasPaneBuilder({
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
}: Omit<SpielwieseCanvasPaneProps, "className" | "onNodesReplace"> & {
  compactNodeIds: Record<string, boolean>;
  onToggleCompact: (nodeId: string) => void;
}) {
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
          className="flex-none pb-2"
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

function CanvasPaneContent({
  canvasJsonEditorState,
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
  onTitleChange,
  onToggleCompact,
}: Omit<SpielwieseCanvasPaneProps, "className" | "onNodesReplace"> & {
  canvasJsonEditorState: ReturnType<typeof useCanvasJsonEditorState>;
  compactNodeIds: Record<string, boolean>;
  onToggleCompact: (nodeId: string) => void;
}) {
  const shell = useOptionalSpielwieseShell();
  const areAllCardsCompact =
    nodes.length > 0 && nodes.every((node) => Boolean(compactNodeIds[node.id]));

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--canvas-pane-outer-radius)] bg-[#F3F3F4] p-[var(--canvas-pane-shell-gap)] shadow-xs [--canvas-pane-inner-radius:18px] [--canvas-pane-outer-radius:calc(var(--canvas-pane-inner-radius)+var(--canvas-pane-shell-gap))] [--canvas-pane-shell-gap:2px]"
      data-testid="spielwiese-editor-canvas-pane-shell"
    >
      <div
        className="bg-background flex min-h-full min-w-0 flex-1 flex-col rounded-[var(--canvas-pane-inner-radius)]"
        data-testid="spielwiese-editor-canvas-pane-surface"
      >
        <div
          className="flex items-center justify-end gap-2 px-2 pt-2 pb-1"
          data-testid="spielwiese-canvas-editor-mode-header"
        >
          <SpielwieseNodeActionButtons
            archiveButtonLabel="Archive canvas nodes"
            compactButtonLabel={`${
              areAllCardsCompact ? "Expand" : "Collapse"
            } all canvas cards`}
            containerTestId="spielwiese-canvas-pane-actions"
            isCompact={areAllCardsCompact}
            isPreviewFocused={false}
            onArchiveNode={() => {}}
            onToggleCompact={() =>
              onToggleCompact(
                areAllCardsCompact ? "__expand-all__" : "__collapse-all__",
              )
            }
            onTogglePreviewFocus={() => shell?.closeSidePanels()}
            previewButtonLabel="Close side panels"
          />
          <CanvasEditorModeToggle
            activeMode={canvasJsonEditorState.mode}
            jsonValue={canvasJsonEditorState.draft}
            onModeChange={canvasJsonEditorState.onModeChange}
          />
        </div>
        {canvasJsonEditorState.mode === "json" ? (
          <CanvasJsonEditor
            error={canvasJsonEditorState.error}
            jsonValue={canvasJsonEditorState.draft}
            onJsonBlur={canvasJsonEditorState.onDraftBlur}
            onJsonChange={canvasJsonEditorState.onDraftChange}
          />
        ) : (
          <CanvasPaneBuilder
            compactNodeIds={compactNodeIds}
            insertAnchorNodeId={insertAnchorNodeId}
            nodes={nodes}
            onAgentNodeArchive={onAgentNodeArchive}
            onAgentNodeInsert={onAgentNodeInsert}
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
    </div>
  );
}

export function SpielwieseCanvasPane({
  className,
  insertAnchorNodeId,
  nodes,
  onNodesReplace,
  onAgentNodeArchive,
  onAgentNodeInsert,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseCanvasPaneProps) {
  const canvasJsonEditorState = useCanvasJsonEditorState({
    nodes,
    onNodesReplace,
  });
  const [compactNodeIds, setCompactNodeIds] = useState<Record<string, boolean>>(
    {},
  );
  const toggleCompact = (nodeId: string) => {
    if (nodeId === "__collapse-all__" || nodeId === "__expand-all__") {
      setCompactNodeIds((currentState) => ({
        ...currentState,
        ...getAllCompactNodeIds(nodes, nodeId === "__collapse-all__"),
      }));
      return;
    }

    setCompactNodeIds((currentState) => ({
      ...currentState,
      [nodeId]: !currentState[nodeId],
    }));
  };

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F3F3F4] px-0 pt-0 pb-1",
        className,
      )}
      data-testid="spielwiese-editor-canvas-pane"
    >
      <CanvasPaneContent
        canvasJsonEditorState={canvasJsonEditorState}
        compactNodeIds={compactNodeIds}
        insertAnchorNodeId={insertAnchorNodeId}
        nodes={nodes}
        onAgentNodeArchive={onAgentNodeArchive}
        onAgentNodeInsert={onAgentNodeInsert}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        onSettingValueChange={onSettingValueChange}
        onToggleCompact={toggleCompact}
        onTitleChange={onTitleChange}
      />
    </div>
  );
}
