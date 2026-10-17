export const generateBatchActionId = (
  projectId: string,
  actionId: string,
  tableName: string,
) => {
  return `${projectId}-${tableName}-${actionId}`;
};

const BATCH_ACTION_IN_PROGRESS_JOB_STATES = [
  "waiting",
  "delayed",
  "active",
] as const;

export const isBatchActionJobInProgressState = (state: string) =>
  (BATCH_ACTION_IN_PROGRESS_JOB_STATES as readonly string[]).includes(state);
