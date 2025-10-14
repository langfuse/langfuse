import type { NormalizerContext, ProviderAdapter } from "../types";

export const genericAdapter: ProviderAdapter = {
  id: "generic",

  detect(_ctx: NormalizerContext): boolean {
    return true; // fallback
  },

  preprocess(
    data: unknown,
    _kind: "input" | "output",
    _ctx: NormalizerContext,
  ): unknown {
    return data; // just return, no transformation
  },
};
