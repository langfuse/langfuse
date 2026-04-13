import { useState } from "react";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import {
  formatEditableCanvasNodes,
  parseEditableCanvasNodes,
} from "./spielwieseEditableCanvasJson";
import type { CanvasEditorMode } from "./spielwieseCanvasPaneEditorMode";

type CanvasJsonEditorStateArgs = {
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
  onNodesReplace: (
    nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  ) => void;
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
  onNodesReplace: CanvasJsonEditorStateArgs["onNodesReplace"];
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

  return { draftState, setDraftState };
}

function getCanvasJsonDraftError(value: string) {
  return parseEditableCanvasNodes(value).ok
    ? null
    : "Invalid JSON. Fix the structure before switching back.";
}

export function useCanvasJsonEditorState({
  nodes,
  onNodesReplace,
}: CanvasJsonEditorStateArgs) {
  const { draftState, setDraftState } = useCanvasJsonDraftState(nodes);

  const tryCommitDraft = (draft: string) => {
    const commitResult = commitCanvasJsonDraft({ draft, onNodesReplace });
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
