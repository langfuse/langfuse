// Helper function to generate dataset run name with timestamp
export function generateDatasetRunName(experimentName: string): string {
  return `${experimentName} - ${new Date().toISOString()}`;
}
