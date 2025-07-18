import { DatasetRunItemDomain } from "../../domain/dataset-run-items";

type AdditionalDatasetRunItemFields = {};

export type FullDatasetRunItem = AdditionalDatasetRunItemFields &
  DatasetRunItemDomain;

export type FullDatasetRunItems = Array<FullDatasetRunItem>;

export type FullDatasetRunItemsWithScores = Array<
  FullDatasetRunItem & { scores?: Record<string, string[] | number[]> | null }
>;
