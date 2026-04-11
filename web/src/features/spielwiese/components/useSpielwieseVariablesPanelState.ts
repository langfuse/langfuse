import { useState } from "react";
import type { SpielwieseVariableVM } from "../types/dashboard";
import {
  createVariableItem,
  type EditableVariableField,
} from "./spielwieseVariablesPanelState";

type EditableVariablesState = {
  items: SpielwieseVariableVM[];
  sourceSignature: string;
};

export type SpielwieseVariablesPanelState = {
  items: SpielwieseVariableVM[];
  onChange: (
    id: SpielwieseVariableVM["id"],
    field: EditableVariableField,
    value: string,
  ) => void;
  onCreate: () => void;
  onDelete: (id: SpielwieseVariableVM["id"]) => void;
  onEnsureDetectedVariables: (labels: string[]) => void;
};

function cloneVariableItems(items: SpielwieseVariableVM[]) {
  return items.map((item) => ({ ...item }));
}

function getVariablesSourceSignature(items: SpielwieseVariableVM[]) {
  return JSON.stringify(items);
}

function updateVariableField({
  field,
  id,
  state,
  value,
}: {
  field: EditableVariableField;
  id: SpielwieseVariableVM["id"];
  state: EditableVariablesState;
  value: string;
}) {
  return {
    ...state,
    items: state.items.map((item) =>
      item.id === id ? { ...item, [field]: value } : item,
    ),
  };
}

function appendCreatedVariable(state: EditableVariablesState) {
  return {
    ...state,
    items: [...state.items, createVariableItem()],
  };
}

function removeVariable(
  state: EditableVariablesState,
  id: SpielwieseVariableVM["id"],
) {
  return {
    ...state,
    items: state.items.filter((item) => item.id !== id),
  };
}

function getDetectedLabels(labels: string[]) {
  return [...new Set(labels.map((label) => label.trim()))].filter(Boolean);
}

function ensureDetectedVariables(
  state: EditableVariablesState,
  labels: string[],
) {
  const detectedLabels = getDetectedLabels(labels);

  if (detectedLabels.length === 0) {
    return state;
  }

  const existingLabels = new Set(state.items.map((item) => item.label.trim()));
  const missingLabels = detectedLabels.filter(
    (label) => !existingLabels.has(label),
  );

  if (missingLabels.length === 0) {
    return state;
  }

  return {
    ...state,
    items: [
      ...state.items,
      ...missingLabels.map((label) => ({
        ...createVariableItem(),
        helper: "",
        label,
      })),
    ],
  };
}

export function useSpielwieseVariablesPanelState(
  initialItems: SpielwieseVariableVM[],
): SpielwieseVariablesPanelState {
  const sourceSignature = getVariablesSourceSignature(initialItems);
  const [state, setState] = useState<EditableVariablesState>(() => ({
    items: cloneVariableItems(initialItems),
    sourceSignature,
  }));

  if (state.sourceSignature !== sourceSignature) {
    setState({
      items: cloneVariableItems(initialItems),
      sourceSignature,
    });
  }

  const onChange = (
    id: SpielwieseVariableVM["id"],
    field: EditableVariableField,
    value: string,
  ) =>
    setState((currentState) =>
      updateVariableField({ field, id, state: currentState, value }),
    );

  const onCreate = () =>
    setState((currentState) => appendCreatedVariable(currentState));

  const onDelete = (id: SpielwieseVariableVM["id"]) =>
    setState((currentState) => removeVariable(currentState, id));

  const onEnsureDetectedVariables = (labels: string[]) =>
    setState((currentState) => ensureDetectedVariables(currentState, labels));

  return {
    items: state.items,
    onChange,
    onCreate,
    onDelete,
    onEnsureDetectedVariables,
  };
}
