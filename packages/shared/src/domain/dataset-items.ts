import { DatasetItem, DatasetStatus } from "../db";

/**
 * Dataset item fields that can hold media references.
 * Used as `field` discriminator in dataset_item_media and the public API.
 */
export const datasetItemMediaFields = [
  "input",
  "expected_output",
  "metadata",
] as const;
export type DatasetItemMediaField = (typeof datasetItemMediaFields)[number];

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
