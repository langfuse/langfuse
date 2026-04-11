import type { SpielwieseAgentNodeVM } from "../types/dashboard";

function getFixedPlaygroundSource(nodes: SpielwieseAgentNodeVM[]) {
  return (
    nodes[0]?.promptSections.find((section) => section.id === "user")?.value ??
    "[sample]"
  );
}

export function getDefaultEditableInput(nodes: SpielwieseAgentNodeVM[]) {
  if (getFixedPlaygroundSource(nodes) === "[image]") {
    return "attached photo notes: grilled salmon lunch, rice on the side, natural light";
  }

  return "type a message";
}

export function getPlaygroundSignature(nodes: SpielwieseAgentNodeVM[]) {
  return JSON.stringify(
    nodes.map((node) => ({
      id: node.id,
      promptSections: node.promptSections,
      settings: node.settings,
      title: node.title,
    })),
  );
}
