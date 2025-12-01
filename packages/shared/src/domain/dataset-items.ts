import { DatasetItem } from "../db";

export type DatasetItemDomain = Omit<
  DatasetItem,
  "sysId" | "validFrom" | "isDeleted"
>;
