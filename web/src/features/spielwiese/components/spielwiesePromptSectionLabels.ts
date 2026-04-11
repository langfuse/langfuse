import { getMessageKind } from "./spielwieseMessageTone";

export const assistantReplySectionLabel = "How the assistant should reply";

export function getPromptSectionLabel(
  kind: "user" | "system" | "assistant" | "tool",
) {
  if (kind === "system") {
    return "Instructions";
  }

  if (kind === "assistant") {
    return assistantReplySectionLabel;
  }

  return `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`;
}

export function getPromptSectionDisplayLabel(sectionId: string, label: string) {
  return getMessageKind(sectionId) === "assistant"
    ? assistantReplySectionLabel
    : label;
}
