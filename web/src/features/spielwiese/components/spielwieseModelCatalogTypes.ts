export type SpielwieseModelScore = 1 | 2 | 3 | 4 | 5;

export type SpielwieseModelBenchmark = {
  label: string;
  score: SpielwieseModelScore;
};

export type SpielwieseModelOption = {
  benchmarks: SpielwieseModelBenchmark[];
  bestFor: string;
  description: string;
  id: string;
  label: string;
  notes: string;
};

export type SpielwieseModelProvider = {
  description: string;
  id: string;
  iconAlt?: string;
  iconSrc?: string;
  label: string;
  latestModels: SpielwieseModelOption[];
  legacyModels: SpielwieseModelOption[];
};
