/* eslint-disable no-unused-vars */

/**
 * Types and enums for dataset run items execution.
 * This file is frontend-safe and doesn't import server-side dependencies.
 */

export enum DatasetRunItemsOperationType {
  READ = "read",
  WRITE = "write",
}

export type DatasetRunItemsExecutionStrategy = {
  shouldWriteToClickHouse: boolean;
  shouldReadFromClickHouse: boolean;
};
