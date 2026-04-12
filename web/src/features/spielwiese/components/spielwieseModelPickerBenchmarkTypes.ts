"use client";

export type SpielwieseBenchmarkMetricTone =
  | "danger"
  | "good"
  | "muted"
  | "warning";

export type SpielwieseBenchmarkRowValue = {
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
