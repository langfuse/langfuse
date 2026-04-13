import type { PlaygroundFlowPreviewVM } from "./SpielwiesePlaygroundFlowPromptPreview";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";

export const adanaKebabPreviewLines = [
  "{",
  '  "food": "adana kebab",',
  '  "serving": {',
  '    "label": "1 skewer",',
  '    "estimated_weight_g": 180',
  "  },",
  '  "macros": {',
  '    "kcal": 418,',
  '    "protein_g": 28.4,',
  '    "carbs_g": 7.9,',
  '    "fat_g": 30.6,',
  '    "fiber_g": 1.1',
  "  },",
  '  "micros": {',
  '    "iron_mg": 4.3,',
  '    "zinc_mg": 5.8,',
  '    "selenium_mcg": 31.2,',
  '    "vitamin_b12_mcg": 2.6,',
  '    "niacin_mg": 7.4,',
  '    "phosphorus_mg": 284,',
  '    "sodium_mg": 842',
  "  }",
  "}",
] as const;

export const simulatedThinkingMeta = {
  reasonedLabel: "Reasoned 2",
  tokensLabel: "356 tok",
  toolCallsLabel: "Tools 0",
} as const;

export const simulatedThinkingSummary = "drafting nutrient JSON";

export function getSimulationTargetNode(
  nodes: SpielwieseAgentNodeVM[],
): SpielwieseAgentNodeVM | undefined {
  return (
    nodes.find((node) => (node.layout ?? "composite") === "user-only") ??
    nodes[0]
  );
}

export function createSimulationPreview(
  node: SpielwieseAgentNodeVM,
  value: string,
  state: PlaygroundFlowPreviewVM["state"] = "streaming",
): PlaygroundFlowPreviewVM {
  return {
    format: "json",
    label: "Answer",
    sectionId: (node.layout ?? "composite") === "user-only" ? "user" : "system",
    state,
    value,
  };
}

export function createPendingSimulationPreview(
  node: SpielwieseAgentNodeVM,
): PlaygroundFlowPreviewVM {
  return createSimulationPreview(node, "", "streaming");
}
