import type { BaseUrlPreset } from "@/src/types/baseUrlPreset";

/** A blank base URL means the default preset; other URLs match ignoring surrounding whitespace and a trailing slash. */
export function findBaseUrlPreset(presets: BaseUrlPreset[], baseURL: string) {
  const normalized = normalize(baseURL);
  if (normalized === "") return presets.find((preset) => preset.isDefault);
  return presets.find((preset) => normalize(preset.url) === normalized);
}

function normalize(url: string) {
  return url.trim().replace(/\/+$/, "");
}
