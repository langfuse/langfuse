/**
 * Types and enums for dataset run items execution.
 * This file is frontend-safe and doesn't import server-side dependencies.
 */

export enum DatasetRunItemsOperationType {
  // eslint-disable-next-line no-unused-vars
  READ = "read",
  // eslint-disable-next-line no-unused-vars
  WRITE = "write",
}

export type DatasetRunItemsExecutionStrategy = {
  shouldWriteToClickHouse: boolean;
  shouldReadFromClickHouse: boolean;
};
