import type {
  SpielwieseModelProvider,
  SpielwieseModelScore,
} from "./spielwieseModelCatalogTypes";
import { xaiProvider } from "./spielwieseModelProviderDataXai";

const benchmarkOrder = ["Quality", "Speed", "Cost", "Tools"] as const;

function createBenchmarks(
  scores: Record<(typeof benchmarkOrder)[number], SpielwieseModelScore>,
) {
  return benchmarkOrder.map((label) => ({
    label,
    score: scores[label],
  }));
}

export const spielwieseModelProviders: SpielwieseModelProvider[] = [
  {
    id: "openai",
    iconAlt: "OpenAI mark",
    iconSrc: "/providers/openai/chatgpt.svg",
    label: "OpenAI",
    description:
      "Frontier general-purpose models with a deep mini-to-nano range.",
    latestModels: [
      {
        id: "gpt-5.4",
        label: "GPT-5.4",
        description: "Flagship reasoning and multimodal quality.",
        bestFor: "High-stakes agent workflows and best-quality output.",
        notes: "Strongest overall quality in the current OpenAI family.",
        benchmarks: createBenchmarks({
          Cost: 2,
          Quality: 5,
          Speed: 3,
          Tools: 5,
        }),
      },
      {
        id: "gpt-5.4-mini",
        label: "GPT-5.4 mini",
        description: "The balanced everyday model.",
        bestFor: "Production agents where quality and speed both matter.",
        notes: "The best default when you need one reliable model.",
        benchmarks: createBenchmarks({
          Cost: 4,
          Quality: 4,
          Speed: 4,
          Tools: 5,
        }),
      },
      {
        id: "gpt-5.4-nano",
        label: "GPT-5.4 nano",
        description: "Lowest-latency model in the newest family.",
        bestFor: "Fast UX, batching, and lightweight classification.",
        notes: "Cheapest way into the newest OpenAI line.",
        benchmarks: createBenchmarks({
          Cost: 5,
          Quality: 3,
          Speed: 5,
          Tools: 3,
        }),
      },
    ],
    legacyModels: [
      {
        id: "gpt-4.1",
        label: "GPT-4.1",
        description: "Previous flagship still useful for compatibility.",
        bestFor: "Existing workflows already tuned to GPT-4.1 behavior.",
        notes: "A strong older default if you want continuity.",
        benchmarks: createBenchmarks({
          Cost: 3,
          Quality: 4,
          Speed: 3,
          Tools: 4,
        }),
      },
      {
        id: "gpt-4.1-mini",
        label: "GPT-4.1 mini",
        description: "Balanced prior-generation mini model.",
        bestFor: "Stable production flows already using GPT-4.1 mini.",
        notes: "Good compatibility bridge from existing prompts.",
        benchmarks: createBenchmarks({
          Cost: 4,
          Quality: 3,
          Speed: 4,
          Tools: 4,
        }),
      },
      {
        id: "gpt-4o-mini",
        label: "GPT-4o mini",
        description: "Legacy fast model optimized for lightweight work.",
        bestFor: "Cheap responses, routing, and support automations.",
        notes: "Still attractive when latency and cost dominate.",
        benchmarks: createBenchmarks({
          Cost: 5,
          Quality: 3,
          Speed: 5,
          Tools: 3,
        }),
      },
    ],
  },
  {
    id: "anthropic",
    iconAlt: "Anthropic mark",
    iconSrc: "/providers/anthropic/claude.svg",
    label: "Anthropic",
    description:
      "Claude models with strong writing quality and dependable tool use.",
    latestModels: [
      {
        id: "claude-opus-4.6",
        label: "Claude Opus 4.6",
        description: "Top-end Claude model for complex work.",
        bestFor: "Long-form reasoning, evaluation, and premium assistants.",
        notes: "Use when depth matters more than cost.",
        benchmarks: createBenchmarks({
          Cost: 2,
          Quality: 5,
          Speed: 3,
          Tools: 4,
        }),
      },
      {
        id: "claude-sonnet-4.6",
        label: "Claude Sonnet 4.6",
        description: "Balanced Claude default.",
        bestFor: "General assistant flows, extraction, and coding support.",
        notes: "Best speed-to-quality point in the Claude family.",
        benchmarks: createBenchmarks({
          Cost: 4,
          Quality: 4,
          Speed: 4,
          Tools: 4,
        }),
      },
      {
        id: "claude-haiku-4.5",
        label: "Claude Haiku 4.5",
        description: "Fast Claude tier for high-volume work.",
        bestFor: "Classification, routing, and fast conversational UX.",
        notes: "Leanest Claude option when you still want Claude tone.",
        benchmarks: createBenchmarks({
          Cost: 5,
          Quality: 3,
          Speed: 5,
          Tools: 3,
        }),
      },
    ],
    legacyModels: [
      {
        id: "claude-3.7-sonnet",
        label: "Claude 3.7 Sonnet",
        description: "Older balanced Claude generation.",
        bestFor: "Existing Claude 3.7 prompt stacks and regressions.",
        notes: "Useful when you want predictable continuity.",
        benchmarks: createBenchmarks({
          Cost: 4,
          Quality: 4,
          Speed: 4,
          Tools: 4,
        }),
      },
      {
        id: "claude-3.5-sonnet",
        label: "Claude 3.5 Sonnet",
        description: "Well-known prior-generation default.",
        bestFor: "Legacy Claude apps that should not be re-tuned yet.",
        notes: "A compatibility pick, not the newest choice.",
        benchmarks: createBenchmarks({
          Cost: 4,
          Quality: 3,
          Speed: 4,
          Tools: 3,
        }),
      },
    ],
  },
  {
    id: "google",
    iconAlt: "Google Gemini mark",
    iconSrc: "/providers/google/gemini.svg",
    label: "Google",
    description:
      "Gemini models spanning flagship reasoning to low-cost flash tiers.",
    latestModels: [
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        description: "Best Gemini for complex reasoning and long context.",
        bestFor: "Heavy analysis, coding, and research assistants.",
        notes: "Choose when context and quality dominate the decision.",
        benchmarks: createBenchmarks({
          Cost: 3,
          Quality: 5,
          Speed: 3,
          Tools: 4,
        }),
      },
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        description: "Fast Gemini workhorse.",
        bestFor: "Interactive agents and balanced multimodal workloads.",
        notes: "The most practical Gemini default for product flows.",
        benchmarks: createBenchmarks({
          Cost: 4,
          Quality: 4,
          Speed: 4,
          Tools: 4,
        }),
      },
      {
        id: "gemini-2.5-flash-lite",
        label: "Gemini 2.5 Flash-Lite",
        description: "Lowest-cost modern Gemini tier.",
        bestFor: "High-volume classification and support automation.",
        notes: "Best when cost ceilings are strict.",
        benchmarks: createBenchmarks({
          Cost: 5,
          Quality: 3,
          Speed: 5,
          Tools: 3,
        }),
      },
    ],
    legacyModels: [
      {
        id: "gemini-2.0-flash",
        label: "Gemini 2.0 Flash",
        description: "Earlier fast Gemini family.",
        bestFor: "Older deployments that still rely on the 2.0 line.",
        notes: "A legacy bridge rather than the first choice.",
        benchmarks: createBenchmarks({
          Cost: 4,
          Quality: 3,
          Speed: 4,
          Tools: 3,
        }),
      },
      {
        id: "gemini-2.0-flash-lite",
        label: "Gemini 2.0 Flash-Lite",
        description: "Older low-cost Gemini tier.",
        bestFor: "Legacy cheap workflows that need continuity.",
        notes: "Lightweight, but clearly behind the 2.5 line.",
        benchmarks: createBenchmarks({
          Cost: 5,
          Quality: 2,
          Speed: 4,
          Tools: 2,
        }),
      },
    ],
  },
  xaiProvider,
];
