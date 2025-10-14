import type { NormalizerContext, ProviderAdapter } from "../types";

export const genericAdapter: ProviderAdapter = {
  id: "generic",

  detect(_ctx: NormalizerContext): boolean {
    return true; // Fallback always matches
  },

  preprocess(data: unknown, _kind: "input" | "output", _ctx: NormalizerContext): unknown {
    return data; // Identity - no transformation
  },
};
