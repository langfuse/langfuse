import { useState } from "react";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import { SpielwieseCanvasPaneStack } from "./SpielwieseCanvasPaneStack";

type SpielwieseEditorCanvasProps = {
  canvas: SpielwieseDashboardVM["canvas"];
};

function cloneAgentNodes(nodes: SpielwieseDashboardVM["canvas"]["agentNodes"]) {
  return nodes.map((node) => ({
    ...node,
    settings: node.settings.map((setting) => ({ ...setting })),
    promptSections: node.promptSections.map((section) => ({ ...section })),
    notes: node.notes.map((note) => ({ ...note })),
  }));
}

type EditableCanvasState = {
  sourceTitle: string;
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
};

function updateEditableNode(
  state: EditableCanvasState,
  nodeId: string,
  updater: (
    node: SpielwieseDashboardVM["canvas"]["agentNodes"][number],
  ) => SpielwieseDashboardVM["canvas"]["agentNodes"][number],
) {
  return {
    ...state,
    nodes: state.nodes.map((node) =>
      node.id === nodeId ? updater(node) : node,
    ),
  };
}

function useEditableCanvas(
  canvas: SpielwieseDashboardVM["canvas"],
): EditableCanvasState & {
  updateNode: (
    nodeId: string,
    updater: (
      node: SpielwieseDashboardVM["canvas"]["agentNodes"][number],
    ) => SpielwieseDashboardVM["canvas"]["agentNodes"][number],
  ) => void;
} {
  const [editableCanvas, setEditableCanvas] = useState<EditableCanvasState>(
    () => ({
      sourceTitle: canvas.title,
      nodes: cloneAgentNodes(canvas.agentNodes),
    }),
  );

  if (editableCanvas.sourceTitle !== canvas.title) {
    setEditableCanvas({
      sourceTitle: canvas.title,
      nodes: cloneAgentNodes(canvas.agentNodes),
    });
  }

  return {
    ...editableCanvas,
    updateNode: (nodeId, updater) =>
      setEditableCanvas((currentCanvas) =>
        updateEditableNode(currentCanvas, nodeId, updater),
      ),
  };
}

export function SpielwieseEditorCanvas({
  canvas,
}: SpielwieseEditorCanvasProps) {
  const editableCanvas = useEditableCanvas(canvas);

  return (
    <section
      className="@container flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="spielwiese-editor-canvas"
    >
      <SpielwieseCanvasPaneStack
        nodes={editableCanvas.nodes}
        onPromptSectionChange={(nodeId, sectionId, value) =>
          editableCanvas.updateNode(nodeId, (node) => ({
            ...node,
            promptSections: node.promptSections.map((section) =>
              section.id === sectionId ? { ...section, value } : section,
            ),
          }))
        }
        onSettingValueChange={(nodeId, settingId, value) =>
          editableCanvas.updateNode(nodeId, (node) => ({
            ...node,
            settings: node.settings.map((setting) =>
              setting.id === settingId ? { ...setting, value } : setting,
            ),
          }))
        }
        onTitleChange={(nodeId, value) =>
          editableCanvas.updateNode(nodeId, (node) => ({
            ...node,
            title: value,
          }))
        }
      />
    </section>
  );
}
