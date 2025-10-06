// Helper function to generate default experiment name
export function generateDefaultExperimentName(
  promptName: string,
  promptVersion: number,
  datasetName: string,
): string {
  return `Prompt ${promptName}-v${promptVersion} on dataset ${datasetName}`;
}

// Helper function to generate default experiment description
export function generateDefaultExperimentDescription(
  promptName: string,
  promptVersion: number,
  datasetName: string,
): string {
  return `Experiment run of prompt ${promptName}-v${promptVersion} on dataset ${datasetName}`;
}

// Helper function to generate dataset run name with timestamp
export function generateDatasetRunName(experimentName: string): string {
  return `${experimentName} - ${new Date().toISOString()}`;
}
