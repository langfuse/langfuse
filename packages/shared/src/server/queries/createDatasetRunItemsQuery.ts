import { DatasetRunItem } from "../../domain/dataset-run-items";

type AdditionalDatasetRunItemFields = {};

export type FullDatasetRunItem = AdditionalDatasetRunItemFields &
  DatasetRunItem;

export type FullDatasetRunItems = Array<FullDatasetRunItem>;

export type FullDatasetRunItemsWithScores = Array<
  FullDatasetRunItem & { scores?: Record<string, string[] | number[]> | null }
>;
