interface ShouldSampleParams {
  samplingRate: number;
  randomValue?: number; // Injectable for testing
}

/**
 * Determines whether an observation should be sampled for evaluation.
 *
 * @param params.samplingRate - A number between 0 and 1 representing the probability
 *                              of sampling. Values >= 1 always sample, values <= 0 never sample.
 * @param params.randomValue - Optional injectable random value for testing.
 *                             If not provided, Math.random() is used.
 * @returns true if the observation should be sampled, false otherwise.
 */
export function shouldSampleObservation(params: ShouldSampleParams): boolean {
  const { samplingRate, randomValue = Math.random() } = params;

  if (samplingRate >= 1) return true;
  if (samplingRate <= 0) return false;

  return randomValue < samplingRate;
}
