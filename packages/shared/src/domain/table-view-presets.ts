import { singleFilter } from "../interfaces/filters";
import { orderBy } from "../interfaces/orderBy";
import z from "zod";

export enum TableViewPresetTableName {
  Traces = "traces",
  Observations = "observations",
  ObservationsEvents = "observations-events",
  Scores = "scores",
  Sessions = "sessions",
  SessionDetail = "session-detail",
  Datasets = "datasets",
  Experiments = "experiments",
  ExperimentItems = "experiment-items",
}

export const TableViewPresetDomainSchema = z.object({
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
  searchQuery: z.string().nullable(),
  orderBy: orderBy,
});

export type TableViewPresetDomain = z.infer<typeof TableViewPresetDomainSchema>;
export type TableViewPresetState = Pick<
  TableViewPresetDomain,
  "filters" | "columnOrder" | "columnVisibility" | "orderBy"
> & {
  searchQuery?: string | null;
};
