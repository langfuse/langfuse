import type { SpielwieseDashboardVM } from "../types/dashboard";

type EditableCanvasNodes = SpielwieseDashboardVM["canvas"]["agentNodes"];
type EditableCanvasNode = EditableCanvasNodes[number];

type ParseNodesResult =
  | { nodes: EditableCanvasNodes; ok: true }
  | { error: string; ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isSetting(
  value: unknown,
): value is EditableCanvasNode["settings"][number] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isString(value.value)
  );
}

function isPromptSection(
  value: unknown,
): value is EditableCanvasNode["promptSections"][number] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isString(value.value)
  );
}

function isNote(value: unknown): value is EditableCanvasNode["notes"][number] {
  return isRecord(value) && isString(value.id) && isString(value.value);
}

function isThinkingStep(
  value: unknown,
): value is NonNullable<
  EditableCanvasNode["playgroundThinking"]
>["steps"][number] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isString(value.value)
  );
}

function isThinking(
  value: unknown,
): value is NonNullable<EditableCanvasNode["playgroundThinking"]> {
  return (
    isRecord(value) &&
    isString(value.summary) &&
    isString(value.title) &&
    Array.isArray(value.steps) &&
    value.steps.every(isThinkingStep)
  );
}

function isPreview(
  value: unknown,
): value is NonNullable<EditableCanvasNode["playgroundPreview"]> {
  return (
    isRecord(value) &&
    (value.format === "json" || value.format === "text") &&
    isString(value.label) &&
    isString(value.value) &&
    (value.toneSectionId === undefined || isString(value.toneSectionId))
  );
}

function isNodeLayout(value: unknown): value is EditableCanvasNode["layout"] {
  return (
    value === undefined ||
    value === "agent-only" ||
    value === "composite" ||
    value === "user-only"
  );
}

function hasEditableCanvasNodeCoreFields(
  value: Record<string, unknown>,
): value is Record<string, string> {
  return (
    isString(value.id) &&
    isString(value.stepLabel) &&
    isString(value.title) &&
    isString(value.description) &&
    isString(value.kind)
  );
}

function hasEditableCanvasNodeCollections(
  value: Record<string, unknown>,
): value is Record<string, unknown[]> {
  return (
    Array.isArray(value.settings) &&
    value.settings.every(isSetting) &&
    Array.isArray(value.promptSections) &&
    value.promptSections.every(isPromptSection) &&
    Array.isArray(value.notes) &&
    value.notes.every(isNote)
  );
}

function hasEditableCanvasNodePlaygroundState(value: Record<string, unknown>) {
  return (
    (value.playgroundThinking === undefined ||
      isThinking(value.playgroundThinking)) &&
    (value.playgroundPreview === undefined ||
      isPreview(value.playgroundPreview))
  );
}

function isEditableCanvasNode(value: unknown): value is EditableCanvasNode {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasEditableCanvasNodeCoreFields(value) &&
    isNodeLayout(value.layout) &&
    hasEditableCanvasNodeCollections(value) &&
    hasEditableCanvasNodePlaygroundState(value)
  );
}

export function formatEditableCanvasNodes(nodes: EditableCanvasNodes) {
  return JSON.stringify(nodes, null, 2);
}

export function parseEditableCanvasNodes(source: string): ParseNodesResult {
  try {
    const parsedValue = JSON.parse(source);

    if (!Array.isArray(parsedValue)) {
      return {
        error: "JSON mode expects an array of agent nodes.",
        ok: false,
      };
    }

    if (!parsedValue.every(isEditableCanvasNode)) {
      return {
        error: "JSON mode only accepts valid agent node objects.",
        ok: false,
      };
    }

    return {
      nodes: parsedValue,
      ok: true,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "JSON could not be parsed.",
      ok: false,
    };
  }
}
