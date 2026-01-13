/**
 * Seeder mode controls data generation strategy:
 * - "bulk": SQL-level generation, fast, high-volume (100k observations). Default.
 * - "synthetic": Memory-based generation, slower, realistic structure (1k observations).
 */
export type SeederMode = "bulk" | "synthetic";

export interface SeederOptions {
  mode: SeederMode;
  numberOfDays: number;
  numberOfRuns?: number;
}

/**
 * Resolves total observations based on seeder mode
 */
export const getTotalObservationsForMode = (mode: SeederMode): number => {
  return mode === "bulk" ? 100000 : 1000;
};

export interface DatasetItemInput {
  datasetName: string;
  itemIndex: number;
  item: any;
  runNumber?: number;
}

export interface FileContent {
  nestedJson: any;
  heavyMarkdown: string;
  chatMlJson: any;
}
