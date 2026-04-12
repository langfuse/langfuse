"use client";

import { useState } from "react";
import { MUSTACHE_REGEX, isValidVariableName } from "@langfuse/shared";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import {
  cloneAgentNode,
  insertAgentNodeAfter,
} from "./spielwieseEditableCanvasNodeInsert";
import {
  createPromptSectionId,
  movePromptSection,
  sortPromptSections,
} from "./spielwieseEditableCanvasPromptSections";
import { getPromptSectionLabel } from "./spielwiesePromptSectionLabels";

type EditableCanvasState = {
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
  return {
    ...state,
    nodes: state.nodes.map((node) =>
      node.id === nodeId ? updater(node) : node,
    ),
  };
}

function updateEditableNodes(
  state: EditableCanvasState,
  updater: (
    nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
  ) => SpielwieseDashboardVM["canvas"]["agentNodes"],
) {
  return {
    ...state,
    nodes: updater(state.nodes),
  };
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

function useEditableCanvas(
  canvas: SpielwieseDashboardVM["canvas"],
): EditableCanvasState & {
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

type PromptSectionHandlerConfig = {
  editableCanvas: ReturnType<typeof useEditableCanvas>;
  onDetectedVariablesChange?: (labels: string[]) => void;
};

function createPromptSectionChangeHandler({
  editableCanvas,
  onDetectedVariablesChange,
}: PromptSectionHandlerConfig) {
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

function createPromptSectionDeleteHandler({
  editableCanvas,
  onDetectedVariablesChange,
}: PromptSectionHandlerConfig) {
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
}: PromptSectionHandlerConfig) {
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

function createPromptSectionMoveHandler({
  editableCanvas,
  onDetectedVariablesChange,
}: PromptSectionHandlerConfig) {
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
) {
  return {
    onNodesReplace: (
      nextNodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
    ) =>
      editableCanvas.updateNodes(
        () => cloneAgentNodes(nextNodes),
        (nextCanvas) =>
          reportDetectedVariables({
            nextCanvas,
            onDetectedVariablesChange,
          }),
      ),
    onAgentNodeInsert: (nodeId: string, kind: "user" | "agent") =>
      editableCanvas.updateNodes(
        (nodes) => insertAgentNodeAfter(nodes, nodeId, kind),
        (nextCanvas) =>
          reportDetectedVariables({
            nextCanvas,
            onDetectedVariablesChange,
          }),
      ),
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

export function useSpielwieseEditableCanvas(
  canvas: SpielwieseDashboardVM["canvas"],
  onDetectedVariablesChange?: (labels: string[]) => void,
) {
  const editableCanvas = useEditableCanvas(canvas);
  const promptSectionHandlers = getPromptSectionHandlers({
    editableCanvas,
    onDetectedVariablesChange,
  });

  return {
    ...getCanvasValueHandlers(editableCanvas, onDetectedVariablesChange),
    ...promptSectionHandlers,
    nodes: editableCanvas.nodes,
  };
}
