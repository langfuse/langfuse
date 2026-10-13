// disable lint as this is exported and used in packages
export enum ModelUsageUnit {
  Characters = "CHARACTERS",
  Tokens = "TOKENS",
  Seconds = "SECONDS",
  Milliseconds = "MILLISECONDS",
  Images = "IMAGES",
  Requests = "REQUESTS",
}

/**
 * How many characters of an experiment item's input / output / expected output
 * the experiments table reads. Shared because a consumer of those fields has to
 * be able to tell a value that was cut off from one that is complete: a string
 * this long may be a prefix, so two of them being equal proves nothing.
 */
export const EXPERIMENT_IO_TRUNCATE_LENGTH = 1000;
