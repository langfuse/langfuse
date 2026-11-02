export const MAX_SELECTED_EXPERIMENTS = 10;

/** Group key for runs that carry no dataset id. */
export const NO_DATASET_KEY = "__no_dataset__";

/** Group labels for a dataset we cannot name. */
export const NO_DATASET_LABEL = "No dataset";
export const UNNAMED_DATASET_LABEL = "Deleted dataset";

/**
 * Per-user preference: auto-select a comparison when a results page opens
 * without one.
 */
export const AUTO_SELECT_COMPARISON_STORAGE_KEY =
  "experiments-auto-select-comparison";

/**
 * Comparison chips rendered before the tail folds into a "+N" badge. Two full
 * names are what the header's width fits; beyond that the row would only be
 * reachable by horizontal scrolling, which nobody does.
 */
export const MAX_VISIBLE_COMPARISON_CHIPS = 2;
