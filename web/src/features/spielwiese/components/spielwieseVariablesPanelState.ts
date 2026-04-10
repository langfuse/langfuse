import type { SpielwieseVariableVM } from "../types/dashboard";

export type EditableVariableField = "helper" | "label";

function getNextVariableId() {
  return `variable-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function getVariableCountLabel(count: number) {
  return `${count} ${count === 1 ? "variable" : "variables"}`;
}

export function createVariableItem(): SpielwieseVariableVM {
  return {
    helper: "",
    id: getNextVariableId(),
    isActive: false,
    label: "",
    tone: "blue",
  };
}
