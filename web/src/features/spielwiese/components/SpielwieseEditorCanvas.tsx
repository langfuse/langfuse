/* eslint-disable max-lines */
import { useState } from "react";
import { MUSTACHE_REGEX, isValidVariableName } from "@langfuse/shared";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import { SpielwieseCanvasPaneStack } from "./SpielwieseCanvasPaneStack";
import { getPromptSectionLabel } from "./spielwiesePromptSectionLabels";
import { getMessageKind } from "./spielwieseMessageTone";

type SpielwieseEditorCanvasProps = {
  canvas: SpielwieseDashboardVM["canvas"];
  onDetectedVariablesChange?: (labels: string[]) => void;
};

function cloneAgentNodes(nodes: SpielwieseDashboardVM["canvas"]["agentNodes"]) {
  return nodes.map((node) => ({
    ...node,
    settings: node.settings.map((setting) => ({ ...setting })),
    promptSections: sortPromptSections(
      node.promptSections.map((section) => ({ ...section })),
    ),
    notes: node.notes.map((note) => ({ ...note })),
  }));
}

type EditableCanvasState = {
  sourceSignature: string;
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
};

function getEditableCanvasSourceSignature(
  canvas: SpielwieseDashboardVM["canvas"],
) {
  return JSON.stringify({
    title: canvas.title,
    agentNodes: canvas.agentNodes.map((node) => ({
      id: node.id,
      title: node.title,
      settings: node.settings,
      promptSections: node.promptSections,
      notes: node.notes,
    })),
  });
}

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

function createPromptSectionId(
  kind: string,
  sections: SpielwieseDashboardVM["canvas"]["agentNodes"][number]["promptSections"],
) {
  const nextIndex =
    sections.filter(
      (section) => section.id === kind || section.id.startsWith(`${kind}-`),
    ).length + 1;

  return nextIndex === 1 ? kind : `${kind}-${nextIndex}`;
}

function getPromptSectionRank(sectionId: string) {
  const messageKind = getMessageKind(sectionId);

  if (messageKind === "user") {
    return 0;
  }

  return messageKind === "system" ? 1 : 2;
}

function sortPromptSections(
  sections: SpielwieseDashboardVM["canvas"]["agentNodes"][number]["promptSections"],
) {
  return sections
    .map((section, index) => ({ index, section }))
    .sort((left, right) => {
      const rankDifference =
        getPromptSectionRank(left.section.id) -
        getPromptSectionRank(right.section.id);

      return rankDifference === 0 ? left.index - right.index : rankDifference;
    })
    .map(({ section }) => section);
}

function movePromptSection(
  sections: SpielwieseDashboardVM["canvas"]["agentNodes"][number]["promptSections"],
  sectionId: string,
  direction: "up" | "down",
) {
  const currentIndex = sections.findIndex(
    (section) => section.id === sectionId,
  );
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex === -1 || nextIndex < 0 || nextIndex >= sections.length) {
    return sections;
  }

  const nextSections = [...sections];
  const [section] = nextSections.splice(currentIndex, 1);

  if (!section) {
    return sections;
  }

  nextSections.splice(nextIndex, 0, section);
  return nextSections;
}

function getDetectedMustacheVariables(
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
) {
  const mustacheRegex = new RegExp(MUSTACHE_REGEX.source, "g");
  const variableNames = nodes.flatMap((node) =>
    node.promptSections.flatMap((section) =>
      [...section.value.matchAll(mustacheRegex)]
        .map((match) => match[1] ?? "")
        .filter((variableName) => isValidVariableName(variableName)),
    ),
  );

  return [...new Set(variableNames)];
}

function reportDetectedVariables({
  nextCanvas,
  onDetectedVariablesChange,
}: {
  nextCanvas: EditableCanvasState;
  onDetectedVariablesChange?: (labels: string[]) => void;
}) {
  onDetectedVariablesChange?.(getDetectedMustacheVariables(nextCanvas.nodes));
}

function updatePromptSectionNode({
  editableCanvas,
  nodeId,
  onDetectedVariablesChange,
  updater,
}: {
  editableCanvas: ReturnType<typeof useEditableCanvas>;
  nodeId: string;
  onDetectedVariablesChange?: (labels: string[]) => void;
  updater: (
    node: SpielwieseDashboardVM["canvas"]["agentNodes"][number],
  ) => SpielwieseDashboardVM["canvas"]["agentNodes"][number];
}) {
  editableCanvas.updateNode(nodeId, updater, (nextCanvas) =>
    reportDetectedVariables({
      nextCanvas,
      onDetectedVariablesChange,
    }),
  );
}

function createPromptSectionDeleteHandler({
  editableCanvas,
  onDetectedVariablesChange,
}: {
  editableCanvas: ReturnType<typeof useEditableCanvas>;
  onDetectedVariablesChange?: (labels: string[]) => void;
}) {
  return (nodeId: string, sectionId: string) =>
    updatePromptSectionNode({
      editableCanvas,
      nodeId,
      onDetectedVariablesChange,
      updater: (node) => ({
        ...node,
        promptSections: sortPromptSections(
          node.promptSections.filter((section) => section.id !== sectionId),
        ),
      }),
    });
}

function createPromptSectionInsertHandler({
  editableCanvas,
  onDetectedVariablesChange,
}: {
  editableCanvas: ReturnType<typeof useEditableCanvas>;
  onDetectedVariablesChange?: (labels: string[]) => void;
}) {
  return (nodeId: string, kind: "user" | "system" | "assistant" | "tool") =>
    updatePromptSectionNode({
      editableCanvas,
      nodeId,
      onDetectedVariablesChange,
      updater: (node) => ({
        ...node,
        promptSections: sortPromptSections([
          ...node.promptSections,
          {
            id: createPromptSectionId(kind, node.promptSections),
            label: getPromptSectionLabel(kind),
            value: "",
          },
        ]),
      }),
    });
}

function createPromptSectionChangeHandler({
  editableCanvas,
  onDetectedVariablesChange,
}: {
  editableCanvas: ReturnType<typeof useEditableCanvas>;
  onDetectedVariablesChange?: (labels: string[]) => void;
}) {
  return (nodeId: string, sectionId: string, value: string) =>
    updatePromptSectionNode({
      editableCanvas,
      nodeId,
      onDetectedVariablesChange,
      updater: (node) => ({
        ...node,
        promptSections: sortPromptSections(
          node.promptSections.map((section) =>
            section.id === sectionId ? { ...section, value } : section,
          ),
        ),
      }),
    });
}

function createPromptSectionMoveHandler({
  editableCanvas,
  onDetectedVariablesChange,
}: {
  editableCanvas: ReturnType<typeof useEditableCanvas>;
  onDetectedVariablesChange?: (labels: string[]) => void;
}) {
  return (nodeId: string, sectionId: string, direction: "up" | "down") =>
    updatePromptSectionNode({
      editableCanvas,
      nodeId,
      onDetectedVariablesChange,
      updater: (node) => ({
        ...node,
        promptSections: sortPromptSections(
          movePromptSection(node.promptSections, sectionId, direction),
        ),
      }),
    });
}

function getPromptSectionHandlers(
  editableCanvas: ReturnType<typeof useEditableCanvas>,
  onDetectedVariablesChange?: (labels: string[]) => void,
) {
  return {
    onPromptSectionDelete: createPromptSectionDeleteHandler({
      editableCanvas,
      onDetectedVariablesChange,
    }),
    onPromptSectionInsert: createPromptSectionInsertHandler({
      editableCanvas,
      onDetectedVariablesChange,
    }),
    onPromptSectionChange: createPromptSectionChangeHandler({
      editableCanvas,
      onDetectedVariablesChange,
    }),
    onPromptSectionMove: createPromptSectionMoveHandler({
      editableCanvas,
      onDetectedVariablesChange,
    }),
  };
}

function getEditableCanvasHandlers(
  editableCanvas: ReturnType<typeof useEditableCanvas>,
  onDetectedVariablesChange?: (labels: string[]) => void,
) {
  return {
    ...getPromptSectionHandlers(editableCanvas, onDetectedVariablesChange),
    onSettingValueChange: (nodeId: string, settingId: string, value: string) =>
      editableCanvas.updateNode(nodeId, (node) => ({
        ...node,
        settings: node.settings.map((setting) =>
          setting.id === settingId ? { ...setting, value } : setting,
        ),
      })),
    onTitleChange: (nodeId: string, value: string) =>
      editableCanvas.updateNode(nodeId, (node) => ({
        ...node,
        title: value,
      })),
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
    onNextCanvas?: (nextCanvas: EditableCanvasState) => void,
  ) => void;
} {
  const sourceSignature = getEditableCanvasSourceSignature(canvas);
  const [editableCanvas, setEditableCanvas] = useState<EditableCanvasState>(
    () => ({
      sourceSignature,
      nodes: cloneAgentNodes(canvas.agentNodes),
    }),
  );

  if (editableCanvas.sourceSignature !== sourceSignature) {
    setEditableCanvas({
      sourceSignature,
      nodes: cloneAgentNodes(canvas.agentNodes),
    });
  }

  return {
    ...editableCanvas,
    updateNode: (nodeId, updater, onNextCanvas) =>
      setEditableCanvas((currentCanvas) => {
        const nextCanvas = updateEditableNode(currentCanvas, nodeId, updater);
        onNextCanvas?.(nextCanvas);
        return nextCanvas;
      }),
  };
}

export function SpielwieseEditorCanvas({
  canvas,
  onDetectedVariablesChange,
}: SpielwieseEditorCanvasProps) {
  const editableCanvas = useEditableCanvas(canvas);
  const editableCanvasHandlers = getEditableCanvasHandlers(
    editableCanvas,
    onDetectedVariablesChange,
  );

  return (
    <section
      className="@container flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="spielwiese-editor-canvas"
    >
      <SpielwieseCanvasPaneStack
        onPromptSectionDelete={editableCanvasHandlers.onPromptSectionDelete}
        onPromptSectionInsert={editableCanvasHandlers.onPromptSectionInsert}
        nodes={editableCanvas.nodes}
        onPromptSectionChange={editableCanvasHandlers.onPromptSectionChange}
        onPromptSectionMove={editableCanvasHandlers.onPromptSectionMove}
        onSettingValueChange={editableCanvasHandlers.onSettingValueChange}
        onTitleChange={editableCanvasHandlers.onTitleChange}
      />
    </section>
  );
}
