import { DatasetItem, DatasetStatus } from "../db";

export type DatasetItemDomain = Pick<
  DatasetItem,
  | "id"
  | "projectId"
  | "datasetId"
  | "input"
  | "expectedOutput"
  | "metadata"
  | "sourceTraceId"
  | "sourceObservationId"
  | "createdAt"
  | "updatedAt"
> & {
  status: DatasetStatus;
};
