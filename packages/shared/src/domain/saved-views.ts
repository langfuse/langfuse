import { singleFilter } from "../interfaces/filters";
import { orderBy } from "../interfaces/orderBy";
import z from "zod";

export enum SavedViewTableName {
  Traces = "traces",
  Observations = "observations",
  Scores = "scores",
  Sessions = "sessions",
}

export const SavedViewDomainSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().nullable(),
  name: z.string(),
  tableName: z.nativeEnum(SavedViewTableName),
  filters: z.array(singleFilter),
  columnOrder: z.array(z.string()),
  columnVisibility: z.record(z.string(), z.boolean()),
  searchQuery: z.string().optional(),
  orderBy: orderBy,
});

export type SavedViewDomain = z.infer<typeof SavedViewDomainSchema>;
