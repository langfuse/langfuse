import { singleFilter } from "../interfaces/filters";
import { orderBy } from "../interfaces/orderBy";
import z from "zod/v4";

export enum TableViewPresetTableName {
  Traces = "traces", // eslint-disable-line no-unused-vars
  Observations = "observations", // eslint-disable-line no-unused-vars
  Scores = "scores", // eslint-disable-line no-unused-vars
  Sessions = "sessions", // eslint-disable-line no-unused-vars
  Datasets = "datasets", // eslint-disable-line no-unused-vars
}

const TableViewPresetDomainSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().nullable(),
  name: z.string(),
  tableName: z.enum(TableViewPresetTableName),
  filters: z.array(singleFilter),
  columnOrder: z.array(z.string()),
  columnVisibility: z.record(z.string(), z.boolean()),
  searchQuery: z.string().optional(),
  orderBy: orderBy,
});

export type TableViewPresetDomain = z.infer<typeof TableViewPresetDomainSchema>;
