export const generateBatchActionId = (
  projectId: string,
  actionId: string,
  tableName: string,
) => {
  return `${projectId}-${tableName}-${actionId}`;
};
