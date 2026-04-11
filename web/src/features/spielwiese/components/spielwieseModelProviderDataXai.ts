import type {
  SpielwieseModelProvider,
  SpielwieseModelScore,
} from "./spielwieseModelCatalogTypes";

const benchmarkOrder = ["Quality", "Speed", "Cost", "Tools"] as const;

function createBenchmarks(
  scores: Record<(typeof benchmarkOrder)[number], SpielwieseModelScore>,
) {
  return benchmarkOrder.map((label) => ({
    label,
    score: scores[label],
  }));
}

export const xaiProvider: SpielwieseModelProvider = {
  id: "xai",
  label: "xAI",
  description:
    "Grok models focused on reasoning and current-events-aware assistants.",
  latestModels: [
    {
      id: "grok-4.20",
      label: "Grok 4.20",
      description: "Newest Grok flagship tier.",
      bestFor: "Reasoning-heavy copilots and premium chat experiences.",
      notes: "The strongest current xAI pick for frontier quality.",
      benchmarks: createBenchmarks({ Cost: 2, Quality: 5, Speed: 3, Tools: 4 }),
    },
    {
      id: "grok-4",
      label: "Grok 4",
      description: "Current mainstream Grok flagship.",
      bestFor: "General Grok-powered assistants and research flows.",
      notes: "A cleaner default if you want the main Grok line.",
      benchmarks: createBenchmarks({ Cost: 3, Quality: 4, Speed: 4, Tools: 4 }),
    },
  ],
  legacyModels: [
    {
      id: "grok-3",
      label: "Grok 3",
      description: "Previous Grok flagship generation.",
      bestFor: "Existing Grok agents already tuned on the 3.x family.",
      notes: "Still solid, but no longer the newest tier.",
      benchmarks: createBenchmarks({ Cost: 3, Quality: 4, Speed: 4, Tools: 3 }),
    },
    {
      id: "grok-3-mini",
      label: "Grok 3 mini",
      description: "Smaller Grok tier for cheaper routing work.",
      bestFor: "Fast triage and lightweight chat.",
      notes: "The budget option in older xAI setups.",
      benchmarks: createBenchmarks({ Cost: 5, Quality: 3, Speed: 4, Tools: 2 }),
    },
  ],
};
