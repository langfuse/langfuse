export function buildExperimentEvaluatorSampleObject(
  datasetItem:
    | {
        input: unknown;
        expectedOutput: unknown;
        metadata: unknown;
      }
    | undefined,
  historicalSample?: Record<string, unknown> | null,
) {
  const datasetSample = datasetItem
    ? {
        input: datasetItem.input,
        experimentItemExpectedOutput: datasetItem.expectedOutput,
        experimentItemMetadata: datasetItem.metadata,
      }
    : null;
  if (!historicalSample) return datasetSample;

  const mergedSample: Record<string, unknown> = { ...datasetSample };
  for (const [key, value] of Object.entries(historicalSample)) {
    if (value !== null && value !== undefined) mergedSample[key] = value;
  }
  return mergedSample;
}
