export const JSON_OPTIMIZATION_STRATEGIES = [
  "original",
  "raw",
  "jsonsimd",
  "worker",
] as const;

export type JSONOptimizationStrategy =
  (typeof JSON_OPTIMIZATION_STRATEGIES)[number];
