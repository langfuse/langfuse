"use client";

import type { SpielwieseModelScore } from "./spielwieseModelCatalog";

export const indexScoreMap: Record<SpielwieseModelScore, number> = {
  1: 44,
  2: 58,
  3: 71,
  4: 84,
  5: 96,
};

export const priceScoreMap: Record<SpielwieseModelScore, number> = {
  1: 96,
  2: 82,
  3: 68,
  4: 55,
  5: 42,
};

export const textToImageRankMap: Partial<Record<string, number>> = {
  "gemini-2.5-flash": 12,
  "gemini-2.5-pro": 9,
  "gpt-5.4": 7,
  "gpt-5.4-mini": 14,
};

export const imageEditingRankMap: Partial<Record<string, number>> = {
  "gemini-2.5-flash": 10,
  "gemini-2.5-pro": 8,
  "gpt-5.4": 6,
  "gpt-5.4-mini": 11,
};
