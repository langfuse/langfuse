import type { BaseUrlPreset } from "@/src/types/baseUrlPreset";

/**
 * OpenAI's regional domains with both regional storage and regional processing,
 * per https://platform.openai.com/docs/guides/data-residency. Storage-only
 * regions are left out, as inference may still run outside them.
 */
export const openAiBaseUrlPresets: BaseUrlPreset[] = [
  { label: "Default", url: "https://api.openai.com/v1", isDefault: true },
  { label: "US data residency", url: "https://us.api.openai.com/v1" },
  { label: "EU data residency", url: "https://eu.api.openai.com/v1" },
  { label: "Australia data residency", url: "https://au.api.openai.com/v1" },
  { label: "Japan data residency", url: "https://jp.api.openai.com/v1" },
  { label: "India data residency", url: "https://in.api.openai.com/v1" },
  { label: "UAE data residency", url: "https://ae.api.openai.com/v1" },
];

export const OPENAI_DATA_RESIDENCY_HINT =
  "Data residency endpoints need an API key from an OpenAI project with data residency enabled for that region.";
