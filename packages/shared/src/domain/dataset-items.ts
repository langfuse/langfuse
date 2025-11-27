import { DatasetItem } from "../db";

export type DatasetItemDomain = Omit<DatasetItem, "updatedAt">;
