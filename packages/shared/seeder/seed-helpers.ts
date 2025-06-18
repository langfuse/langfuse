export const generateDatasetRunTraceId = (
  datasetName: string,
  itemIndex: number,
  projectId: string,
  runNumber: number,
) => {
  return `trace-dataset-${datasetName}-${itemIndex}-${projectId.slice(-8)}-${runNumber}`;
};

export const generateEvalTraceId = (
  evalTemplateId: string,
  index: number,
  projectId: string,
) => {
  return `trace-eval-${evalTemplateId}-${projectId.slice(-8)}-${index}`;
};

export const generateEvalObservationId = (
  evalTemplateId: string,
  index: number,
  projectId: string,
) => {
  return `observation-eval-${evalTemplateId}-${projectId.slice(-8)}-${index}`;
};

export const generateEvalScoreId = (
  evalTemplateId: string,
  index: number,
  projectId: string,
) => {
  return `score-eval-${evalTemplateId}-${projectId.slice(-8)}-${index}`;
};
