"use client";

import { useState } from "react";
import { MUSTACHE_REGEX, isValidVariableName } from "@langfuse/shared";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import { getMessageKind } from "./spielwieseMessageTone";
import { getPromptSectionLabel } from "./spielwiesePromptSectionLabels";

type EditableCanvasState = {
  sourceSignature: string;
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"];
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
) {
  return {
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
    ...getCanvasValueHandlers(editableCanvas),
    ...promptSectionHandlers,
    nodes: editableCanvas.nodes,
  };
}
