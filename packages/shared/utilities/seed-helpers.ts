export const generateTraceId = (
  datasetName: string,
  itemIndex: number,
  projectId: string,
  runNumber: number,
) => {
  return `trace-dataset-${datasetName}-${itemIndex}-${projectId.slice(-8)}-${runNumber}`;
};
