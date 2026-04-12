"use client";

import type {
  SpielwieseModelOption,
  SpielwieseModelScore,
} from "./spielwieseModelCatalog";
import {
  createMetricRow,
  createRankRow,
  type SpielwieseBenchmarkTableRow,
} from "./spielwieseModelPickerBenchmarkHelpers";
import {
  agenticBenchmarkInfo,
  artificialAnalysisMethodologyHref,
  codingBenchmarkInfo,
  imageEditBenchmarkInfo,
  imageGenBenchmarkInfo,
  intelligenceBenchmarkInfo,
  priceBenchmarkInfo,
  speedBenchmarkInfo,
  weightsBenchmarkInfo,
} from "./spielwieseModelPickerBenchmarkInfo";

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

const primaryMetricRows = [
  {
    description: intelligenceBenchmarkInfo,
    direction: "higher" as const,
    href: artificialAnalysisMethodologyHref,
    key: "intelligence" as const,
    label: "Intelligence",
    prefix: "",
  },
  {
    description: speedBenchmarkInfo,
    direction: "higher" as const,
    href: artificialAnalysisMethodologyHref,
    key: "speed" as const,
    label: "Speed",
    prefix: "",
  },
  {
    description: priceBenchmarkInfo,
    direction: "lower" as const,
    href: artificialAnalysisMethodologyHref,
    key: "price" as const,
    label: "Cost",
    prefix: "$",
  },
  {
    description: codingBenchmarkInfo,
    direction: "higher" as const,
    href: artificialAnalysisMethodologyHref,
    key: "coding" as const,
    label: "Coding",
    prefix: "",
  },
  {
    description: agenticBenchmarkInfo,
    direction: "higher" as const,
    href: artificialAnalysisMethodologyHref,
    key: "agentic" as const,
    label: "Agentic",
    prefix: "",
  },
];

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

function getPrimaryMetricRows(
  profile: SpielwieseModelBenchmarkProfile,
): SpielwieseBenchmarkTableRow[] {
  return primaryMetricRows.map((row) =>
    createMetricRow({
      direction: row.direction,
      info: {
        description: row.description,
        href: row.href,
        label: row.label,
      },
      label: row.label,
      text: `${row.prefix}${profile[row.key]}`,
      value: profile[row.key],
    }),
  );
}

function getSupplementaryRows(
  profile: SpielwieseModelBenchmarkProfile,
): SpielwieseBenchmarkTableRow[] {
  return [
    {
      info: {
        description: weightsBenchmarkInfo,
        href: artificialAnalysisMethodologyHref,
        label: "Weights",
      },
      label: "Weights",
      value: {
        kind: "metric",
        text: profile.isOpenWeights ? "Open" : "Closed",
        tone: profile.isOpenWeights ? "good" : "muted",
      },
    },
    createRankRow({
      info: {
        description: imageGenBenchmarkInfo,
        href: artificialAnalysisMethodologyHref,
        label: "Image gen",
      },
      label: "Image gen",
      rank: profile.textToImageRank,
    }),
    createRankRow({
      info: {
        description: imageEditBenchmarkInfo,
        href: artificialAnalysisMethodologyHref,
        label: "Image edit",
      },
      label: "Image edit",
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
