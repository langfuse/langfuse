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
  | "validFrom"
> & {
  status: DatasetStatus;
};

/**
 * DatasetItemDomain without IO fields (input, expectedOutput, metadata)
 * Used for listing items without fetching large payloads
 */
export type DatasetItemDomainWithoutIO = Omit<
  DatasetItemDomain,
  "input" | "expectedOutput" | "metadata"
>;
