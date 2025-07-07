export const JSON_OPTIMIZATION_STRATEGIES = [
  "original",
  "raw",
  "streaming",
  "worker",
] as const;

export type JSONOptimizationStrategy =
  (typeof JSON_OPTIMIZATION_STRATEGIES)[number];
