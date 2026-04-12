"use client";

import type {
  SpielwieseModelOption,
  SpielwieseModelScore,
} from "./spielwieseModelCatalog";

export const artificialAnalysisMethodologyHref =
  "https://artificialanalysis.ai/methodology/intelligence-benchmarking";

export const intelligenceBenchmarkInfo =
  "Derived by the Artificial Analysis Index.";

export const codingBenchmarkInfo =
  "Represents the weighted average of coding benchmarks in the Artificial Analysis Intelligence Index (Terminal-Bench Hard, SciCode).";

export const agenticBenchmarkInfo =
  "Represents the average of agentic capabilities benchmarks in the Artificial Analysis Intelligence Index (GDPval-AA, tau^2-Bench Telecom).";

export type SpielwieseBenchmarkMetricTone =
  | "danger"
  | "good"
  | "muted"
  | "warning";

export type SpielwieseBenchmarkRowValue =
  | {
      kind: "badges";
      values: { active: boolean; label: string }[];
    }
  | {
      kind: "metric";
      text: string;
      tone: SpielwieseBenchmarkMetricTone;
    };

export type SpielwieseBenchmarkTableRow = {
  info?: {
    description: string;
    href?: string;
    label: string;
  };
  label: string;
  note?: string;
  value: SpielwieseBenchmarkRowValue;
};

export type SpielwieseModelBenchmarkProfile = {
  agentic: number;
  coding: number;
  imageEditingRank: number | null;
  intelligence: number;
  isOpenWeights: boolean;
  price: number;
  speed: number;
  textToImageRank: number | null;
};

const indexScoreMap: Record<SpielwieseModelScore, number> = {
  1: 44,
  2: 58,
  3: 71,
  4: 84,
  5: 96,
};

const priceScoreMap: Record<SpielwieseModelScore, number> = {
  1: 96,
  2: 82,
  3: 68,
  4: 55,
  5: 42,
};

const textToImageRankMap: Partial<Record<string, number>> = {
  "gemini-2.5-flash": 12,
  "gemini-2.5-pro": 9,
  "gpt-5.4": 7,
  "gpt-5.4-mini": 14,
};

const imageEditingRankMap: Partial<Record<string, number>> = {
  "gemini-2.5-flash": 10,
  "gemini-2.5-pro": 8,
  "gpt-5.4": 6,
  "gpt-5.4-mini": 11,
};

function getBenchmarkScore(
  model: SpielwieseModelOption,
  label: string,
): SpielwieseModelScore {
  return (
    model.benchmarks.find((benchmark) => benchmark.label === label)?.score ?? 3
  );
}

function getWeightedIndex({
  primaryScore,
  primaryWeight,
  secondaryScore,
}: {
  primaryScore: SpielwieseModelScore;
  primaryWeight: number;
  secondaryScore: SpielwieseModelScore;
}) {
  const secondaryWeight = 1 - primaryWeight;

  return Math.round(
    indexScoreMap[primaryScore] * primaryWeight +
      indexScoreMap[secondaryScore] * secondaryWeight,
  );
}

export function getModelBenchmarkProfile(
  model: SpielwieseModelOption,
): SpielwieseModelBenchmarkProfile {
  const qualityScore = getBenchmarkScore(model, "Quality");
  const speedScore = getBenchmarkScore(model, "Speed");
  const costScore = getBenchmarkScore(model, "Cost");
  const toolScore = getBenchmarkScore(model, "Tools");

  return {
    agentic: getWeightedIndex({
      primaryScore: toolScore,
      primaryWeight: 0.55,
      secondaryScore: speedScore,
    }),
    coding: getWeightedIndex({
      primaryScore: qualityScore,
      primaryWeight: 0.65,
      secondaryScore: toolScore,
    }),
    imageEditingRank: imageEditingRankMap[model.id] ?? null,
    intelligence: indexScoreMap[qualityScore],
    isOpenWeights: false,
    price: priceScoreMap[costScore],
    speed: indexScoreMap[speedScore],
    textToImageRank: textToImageRankMap[model.id] ?? null,
  };
}

export function getBenchmarkTone({
  direction,
  value,
}: {
  direction: "higher" | "lower" | "rank";
  value: number | null;
}): SpielwieseBenchmarkMetricTone {
  if (value === null) {
    return "muted";
  }

  if (direction === "rank") {
    if (value <= 8) {
      return "good";
    }

    if (value <= 16) {
      return "warning";
    }

    return "danger";
  }

  if (direction === "lower") {
    if (value <= 55) {
      return "good";
    }

    if (value <= 75) {
      return "warning";
    }

    return "danger";
  }

  if (value >= 82) {
    return "good";
  }

  if (value >= 65) {
    return "warning";
  }

  return "danger";
}

function formatLeaderboardValue(rank: number | null) {
  if (rank === null) {
    return {
      text: "n/a",
      tone: "muted" as const,
    };
  }

  return {
    text: `#${rank}`,
    tone: getBenchmarkTone({ direction: "rank", value: rank }),
  };
}

function createMetricRow({
  direction,
  info,
  label,
  note,
  text,
  value,
}: {
  direction: "higher" | "lower";
  info?: SpielwieseBenchmarkTableRow["info"];
  label: string;
  note?: string;
  text: string;
  value: number;
}): SpielwieseBenchmarkTableRow {
  return {
    info,
    label,
    note,
    value: {
      kind: "metric",
      text,
      tone: getBenchmarkTone({ direction, value }),
    },
  };
}

function createRankRow({
  label,
  rank,
}: {
  label: string;
  rank: number | null;
}): SpielwieseBenchmarkTableRow {
  const value = formatLeaderboardValue(rank);

  return {
    label,
    value: {
      kind: "metric",
      text: value.text,
      tone: value.tone,
    },
  };
}

function getPrimaryMetricRows(
  profile: SpielwieseModelBenchmarkProfile,
): SpielwieseBenchmarkTableRow[] {
  return [
    createMetricRow({
      direction: "higher",
      info: {
        description: intelligenceBenchmarkInfo,
        href: artificialAnalysisMethodologyHref,
        label: "Intelligence",
      },
      label: "Intelligence",
      text: `${profile.intelligence}`,
      value: profile.intelligence,
    }),
    createMetricRow({
      direction: "higher",
      label: "Speed",
      note: "Output tokens per second. Higher is better.",
      text: `${profile.speed}`,
      value: profile.speed,
    }),
    createMetricRow({
      direction: "lower",
      label: "Price",
      note: "USD per 1M tokens. Lower is better.",
      text: `$${profile.price}`,
      value: profile.price,
    }),
    createMetricRow({
      direction: "higher",
      info: {
        description: codingBenchmarkInfo,
        label: "Coding index",
      },
      label: "Coding index",
      text: `${profile.coding}`,
      value: profile.coding,
    }),
    createMetricRow({
      direction: "higher",
      info: {
        description: agenticBenchmarkInfo,
        label: "Agentic index",
      },
      label: "Agentic index",
      text: `${profile.agentic}`,
      value: profile.agentic,
    }),
  ];
}

function getSupplementaryRows(
  profile: SpielwieseModelBenchmarkProfile,
): SpielwieseBenchmarkTableRow[] {
  return [
    {
      label: "Weights",
      value: {
        kind: "badges",
        values: [
          { active: profile.isOpenWeights, label: "Open weights" },
          { active: !profile.isOpenWeights, label: "Proprietary" },
        ],
      },
    },
    createRankRow({
      label: "Text to image place",
      rank: profile.textToImageRank,
    }),
    createRankRow({
      label: "Image editing place",
      rank: profile.imageEditingRank,
    }),
  ];
}

export function getBenchmarkTableRows(
  model: SpielwieseModelOption,
): SpielwieseBenchmarkTableRow[] {
  const profile = getModelBenchmarkProfile(model);

  return [...getPrimaryMetricRows(profile), ...getSupplementaryRows(profile)];
}
