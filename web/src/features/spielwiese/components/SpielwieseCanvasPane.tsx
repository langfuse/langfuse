import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseDashboardVM } from "../types/dashboard";
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
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
  onNodesReplace: (
    nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  ) => void;
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

function CanvasPaneContent({
  canvasJsonEditorState,
  nodes,
  onAgentNodeInsert,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionChange,
  onPromptSectionMove,
  onSettingValueChange,
  onTitleChange,
}: Omit<SpielwieseCanvasPaneProps, "className" | "onNodesReplace"> & {
  canvasJsonEditorState: ReturnType<typeof useCanvasJsonEditorState>;
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-[var(--canvas-pane-outer-radius)] bg-[#F3F3F4] p-[var(--canvas-pane-shell-gap)] shadow-xs [--canvas-pane-inner-radius:18px] [--canvas-pane-outer-radius:calc(var(--canvas-pane-inner-radius)+var(--canvas-pane-shell-gap))] [--canvas-pane-shell-gap:2px]"
      data-testid="spielwiese-editor-canvas-pane-shell"
    >
      <div
        className="bg-background flex min-h-full min-w-0 flex-1 flex-col rounded-[var(--canvas-pane-inner-radius)]"
        data-testid="spielwiese-editor-canvas-pane-surface"
      >
        <div
          className="flex items-center justify-end px-2 pt-2 pb-1"
          data-testid="spielwiese-canvas-editor-mode-header"
        >
          <CanvasEditorModeToggle
            activeMode={canvasJsonEditorState.mode}
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
          <SpielwieseAgentNodeStack
            listClassName="pt-2 pb-2 sm:pt-2"
            nodes={nodes}
            onAgentNodeInsert={onAgentNodeInsert}
            onPromptSectionDelete={onPromptSectionDelete}
            onPromptSectionInsert={onPromptSectionInsert}
            onPromptSectionChange={onPromptSectionChange}
            onPromptSectionMove={onPromptSectionMove}
            onSettingValueChange={onSettingValueChange}
            onTitleChange={onTitleChange}
          />
        )}
      </div>
    </div>
  );
}

export function SpielwieseCanvasPane({
  className,
  nodes,
  onNodesReplace,
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

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F3F3F4] px-0 pt-0 pb-2",
        className,
      )}
      data-testid="spielwiese-editor-canvas-pane"
    >
      <CanvasPaneContent
        canvasJsonEditorState={canvasJsonEditorState}
        nodes={nodes}
        onAgentNodeInsert={onAgentNodeInsert}
        onPromptSectionChange={onPromptSectionChange}
        onPromptSectionDelete={onPromptSectionDelete}
        onPromptSectionInsert={onPromptSectionInsert}
        onPromptSectionMove={onPromptSectionMove}
        onSettingValueChange={onSettingValueChange}
        onTitleChange={onTitleChange}
      />
    </div>
  );
}
