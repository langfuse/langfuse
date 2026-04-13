/* eslint-disable max-lines */
"use client";

import { useState } from "react";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import {
  cloneAgentNode,
  emptyCanvasInsertAnchorNodeId,
  insertAgentNodeAfter,
} from "./spielwieseEditableCanvasNodeInsert";
import {
  createPromptSectionId,
  movePromptSection,
  sortPromptSections,
} from "./spielwieseEditableCanvasPromptSections";
import { getSpielwieseDetectedVariableLabels } from "./spielwieseMustacheVariables";
import { getPromptSectionLabel } from "./spielwiesePromptSectionLabels";

type EditableCanvasState = {
  archivedNodeIds: string[];
  sourceSignature: string;
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
};

function cloneAgentNodes(nodes: SpielwieseDashboardVM["canvas"]["agentNodes"]) {
  return nodes.map((node) => {
    const clonedNode = cloneAgentNode(node);

    return {
      ...clonedNode,
      promptSections: sortPromptSections(clonedNode.promptSections),
    };
  });
}

function getEditableCanvasSourceSignature(
  canvas: SpielwieseDashboardVM["canvas"],
) {
  return JSON.stringify({
    title: canvas.title,
    agentNodes: canvas.agentNodes.map((node) => ({
      id: node.id,
      layout: node.layout,
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
  const nextNodes = state.nodes.map((node) =>
    node.id === nodeId ? updater(node) : node,
  );

  return {
    ...state,
    nodes: nextNodes,
    archivedNodeIds: syncArchivedNodeIds(state.archivedNodeIds, nextNodes),
  };
}

function updateEditableNodes(
  state: EditableCanvasState,
  updater: (
    nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  ) => SpielwieseDashboardVM["canvas"]["agentNodes"],
) {
  const nextNodes = updater(state.nodes);

  return {
    ...state,
    nodes: nextNodes,
    archivedNodeIds: syncArchivedNodeIds(state.archivedNodeIds, nextNodes),
  };
}

function syncArchivedNodeIds(
  archivedNodeIds: EditableCanvasState["archivedNodeIds"],
  nodes: EditableCanvasState["nodes"],
) {
  const nodeIds = new Set(nodes.map((node) => node.id));

  return archivedNodeIds.filter((nodeId) => nodeIds.has(nodeId));
}

function getVisibleNodes(state: EditableCanvasState) {
  const archivedNodeIds = new Set(state.archivedNodeIds);

  return state.nodes.filter((node) => !archivedNodeIds.has(node.id));
}

function getInsertAnchorNodeId(state: EditableCanvasState) {
  const visibleNodes = getVisibleNodes(state);

  return (
    visibleNodes.at(-1)?.id ??
    state.nodes.at(-1)?.id ??
    emptyCanvasInsertAnchorNodeId
  );
}

function getDetectedMustacheVariables(
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
) {
  return getSpielwieseDetectedVariableLabels(nodes);
}

function reportDetectedVariables({
  nextCanvas,
  onDetectedVariablesChange,
}: {
  nextCanvas: EditableCanvasState;
  onDetectedVariablesChange?: (labels: string[]) => void;
}) {
  onDetectedVariablesChange?.(
    getDetectedMustacheVariables(getVisibleNodes(nextCanvas)),
  );
}

function reportEditableCanvasChange({
  nextCanvas,
  onDetectedVariablesChange,
  onNodesChange,
}: {
  nextCanvas: EditableCanvasState;
  onDetectedVariablesChange?: (labels: string[]) => void;
  onNodesChange?: (
    nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  ) => void;
}) {
  reportDetectedVariables({
    nextCanvas,
    onDetectedVariablesChange,
  });
  onNodesChange?.(getVisibleNodes(nextCanvas));
}

function createEditableCanvasReporter({
  onDetectedVariablesChange,
  onNodesChange,
}: {
  onDetectedVariablesChange?: (labels: string[]) => void;
  onNodesChange?: (
    nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  ) => void;
}) {
  return (nextCanvas: EditableCanvasState) =>
    reportEditableCanvasChange({
      nextCanvas,
      onDetectedVariablesChange,
      onNodesChange,
    });
}

function updateReportedNodes(
  editableCanvas: ReturnType<typeof useEditableCanvas>,
  updater: (
    nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  ) => SpielwieseDashboardVM["canvas"]["agentNodes"],
  reportCanvasChange: (nextCanvas: EditableCanvasState) => void,
) {
  editableCanvas.updateNodes(updater, reportCanvasChange);
}

function updateReportedNode(
  editableCanvas: ReturnType<typeof useEditableCanvas>,
  nodeId: string,
  updater: (
    node: SpielwieseDashboardVM["canvas"]["agentNodes"][number],
  ) => SpielwieseDashboardVM["canvas"]["agentNodes"][number],
  reportCanvasChange: (nextCanvas: EditableCanvasState) => void,
) {
  editableCanvas.updateNode(nodeId, updater, reportCanvasChange);
}

// eslint-disable-next-line max-lines-per-function
function useEditableCanvas(
  canvas: SpielwieseDashboardVM["canvas"],
): EditableCanvasState & {
  archiveNode: (
    nodeId: string,
    onNextCanvas?: (nextCanvas: EditableCanvasState) => void,
  ) => void;
  updateNodes: (
    updater: (
      nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
    ) => SpielwieseDashboardVM["canvas"]["agentNodes"],
    onNextCanvas?: (nextCanvas: EditableCanvasState) => void,
  ) => void;
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
      archivedNodeIds: [],
    }),
  );

  if (editableCanvas.sourceSignature !== sourceSignature) {
    setEditableCanvas({
      sourceSignature,
      nodes: cloneAgentNodes(canvas.agentNodes),
      archivedNodeIds: [],
    });
  }

  return {
    ...editableCanvas,
    archiveNode: (nodeId, onNextCanvas) =>
      setEditableCanvas((currentCanvas) => {
        const archivedNodeIds = currentCanvas.archivedNodeIds.includes(nodeId)
          ? currentCanvas.archivedNodeIds
          : [...currentCanvas.archivedNodeIds, nodeId];
        const nextCanvas = {
          ...currentCanvas,
          archivedNodeIds,
        };

        onNextCanvas?.(nextCanvas);
        return nextCanvas;
      }),
    updateNodes: (updater, onNextCanvas) =>
      setEditableCanvas((currentCanvas) => {
        const nextCanvas = updateEditableNodes(currentCanvas, updater);
        onNextCanvas?.(nextCanvas);
        return nextCanvas;
      }),
    updateNode: (nodeId, updater, onNextCanvas) =>
      setEditableCanvas((currentCanvas) => {
        const nextCanvas = updateEditableNode(currentCanvas, nodeId, updater);
        onNextCanvas?.(nextCanvas);
        return nextCanvas;
      }),
  };
}

function updatePromptSectionNode({
  editableCanvas,
  nodeId,
  onDetectedVariablesChange,
  onNodesChange,
  updater,
}: {
  editableCanvas: ReturnType<typeof useEditableCanvas>;
  nodeId: string;
  onDetectedVariablesChange?: (labels: string[]) => void;
  onNodesChange?: (
    nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  ) => void;
  updater: (
    node: SpielwieseDashboardVM["canvas"]["agentNodes"][number],
  ) => SpielwieseDashboardVM["canvas"]["agentNodes"][number];
}) {
  editableCanvas.updateNode(nodeId, updater, (nextCanvas) =>
    reportEditableCanvasChange({
      nextCanvas,
      onDetectedVariablesChange,
      onNodesChange,
    }),
  );
}

type PromptSectionHandlerConfig = {
  editableCanvas: ReturnType<typeof useEditableCanvas>;
  onDetectedVariablesChange?: (labels: string[]) => void;
  onNodesChange?: (
    nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  ) => void;
};

function createPromptSectionChangeHandler({
  editableCanvas,
  onDetectedVariablesChange,
  onNodesChange,
}: PromptSectionHandlerConfig) {
  return (nodeId: string, sectionId: string, value: string) =>
    updatePromptSectionNode({
      editableCanvas,
      nodeId,
      onDetectedVariablesChange,
      onNodesChange,
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

function createPromptSectionDeleteHandler({
  editableCanvas,
  onDetectedVariablesChange,
  onNodesChange,
}: PromptSectionHandlerConfig) {
  return (nodeId: string, sectionId: string) =>
    updatePromptSectionNode({
      editableCanvas,
      nodeId,
      onDetectedVariablesChange,
      onNodesChange,
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
  onNodesChange,
}: PromptSectionHandlerConfig) {
  return (nodeId: string, kind: "user" | "system" | "assistant" | "tool") =>
    updatePromptSectionNode({
      editableCanvas,
      nodeId,
      onDetectedVariablesChange,
      onNodesChange,
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

function createPromptSectionMoveHandler({
  editableCanvas,
  onDetectedVariablesChange,
  onNodesChange,
}: PromptSectionHandlerConfig) {
  return (nodeId: string, sectionId: string, direction: "up" | "down") =>
    updatePromptSectionNode({
      editableCanvas,
      nodeId,
      onDetectedVariablesChange,
      onNodesChange,
      updater: (node) => ({
        ...node,
        promptSections: sortPromptSections(
          movePromptSection(node.promptSections, sectionId, direction),
        ),
      }),
    });
}

function getPromptSectionHandlers(config: PromptSectionHandlerConfig) {
  return {
    onPromptSectionChange: createPromptSectionChangeHandler(config),
    onPromptSectionDelete: createPromptSectionDeleteHandler(config),
    onPromptSectionInsert: createPromptSectionInsertHandler(config),
    onPromptSectionMove: createPromptSectionMoveHandler(config),
  };
}

function getCanvasValueHandlers(
  editableCanvas: ReturnType<typeof useEditableCanvas>,
  onDetectedVariablesChange?: (labels: string[]) => void,
  onNodesChange?: (
    nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  ) => void,
) {
  const reportCanvasChange = createEditableCanvasReporter({
    onDetectedVariablesChange,
    onNodesChange,
  });

  return {
    onNodesReplace: (
      nextNodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
    ) =>
      updateReportedNodes(
        editableCanvas,
        () => cloneAgentNodes(nextNodes),
        reportCanvasChange,
      ),
    onAgentNodeInsert: (nodeId: string, kind: "user" | "agent") =>
      updateReportedNodes(
        editableCanvas,
        (nodes) => insertAgentNodeAfter(nodes, nodeId, kind),
        reportCanvasChange,
      ),
    onAgentNodeArchive: (nodeId: string) =>
      editableCanvas.archiveNode(nodeId, reportCanvasChange),
    onSettingValueChange: (nodeId: string, settingId: string, value: string) =>
      updateReportedNode(
        editableCanvas,
        nodeId,
        (node) => ({
          ...node,
          settings: node.settings.map((setting) =>
            setting.id === settingId ? { ...setting, value } : setting,
          ),
        }),
        reportCanvasChange,
      ),
    onTitleChange: (nodeId: string, value: string) =>
      updateReportedNode(
        editableCanvas,
        nodeId,
        (node) => ({
          ...node,
          title: value,
        }),
        reportCanvasChange,
      ),
  };
}

export function useSpielwieseEditableCanvas(
  canvas: SpielwieseDashboardVM["canvas"],
  onDetectedVariablesChange?: (labels: string[]) => void,
  onNodesChange?: (
    nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  ) => void,
) {
  const editableCanvas = useEditableCanvas(canvas);
  const promptSectionHandlers = getPromptSectionHandlers({
    editableCanvas,
    onDetectedVariablesChange,
    onNodesChange,
  });

  return {
    ...getCanvasValueHandlers(
      editableCanvas,
      onDetectedVariablesChange,
      onNodesChange,
    ),
    ...promptSectionHandlers,
    insertAnchorNodeId: getInsertAnchorNodeId(editableCanvas),
    nodes: getVisibleNodes(editableCanvas),
  };
}
