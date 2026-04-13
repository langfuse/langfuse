import { MUSTACHE_REGEX, isValidVariableName } from "@langfuse/shared";
import type {
  SpielwieseAgentNodePromptSectionVM,
  SpielwieseAgentNodeVM,
} from "../types/dashboard";

type NodeWithPromptSections = Pick<SpielwieseAgentNodeVM, "promptSections">;

export function getSpielwiesePromptVariableLabels(
  promptSections: SpielwieseAgentNodePromptSectionVM[],
) {
  const mustacheRegex = new RegExp(MUSTACHE_REGEX.source, "g");

  return [
    ...new Set(
      promptSections.flatMap((section) =>
        [...section.value.matchAll(mustacheRegex)]
          .map((match) => match[1] ?? "")
          .filter((variableName) => isValidVariableName(variableName)),
      ),
    ),
  ];
}

export function getSpielwieseNodeVariableLabels(node: NodeWithPromptSections) {
  return getSpielwiesePromptVariableLabels(node.promptSections);
}

export function getSpielwieseDetectedVariableLabels(
  nodes: NodeWithPromptSections[],
) {
  return [
    ...new Set(nodes.flatMap((node) => getSpielwieseNodeVariableLabels(node))),
  ];
}
