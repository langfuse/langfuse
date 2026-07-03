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

/**
 * Categories used to group system table view presets into the quick-access
 * chip row rendered beneath the search bar (v4 events table). This enum is the
 * single source of truth for grouping and display order; the frontend maps
 * each category to an icon locally (lucide icons are not available in shared).
 */
export enum SystemTableViewPresetCategory {
  SlowCalls = "slow-calls",
  Errors = "errors",
  CostRegression = "cost-regression",
  LowQuality = "low-quality",
}

export const SYSTEM_TABLE_VIEW_PRESET_CATEGORY_META: Record<
  SystemTableViewPresetCategory,
  { label: string; order: number }
> = {
  [SystemTableViewPresetCategory.SlowCalls]: { label: "Slow", order: 1 },
  [SystemTableViewPresetCategory.Errors]: { label: "Errors", order: 2 },
  [SystemTableViewPresetCategory.CostRegression]: {
    label: "Cost",
    order: 3,
  },
  [SystemTableViewPresetCategory.LowQuality]: {
    label: "Low quality",
    order: 4,
  },
};

/** Categories in their defined display order. */
export const SYSTEM_TABLE_VIEW_PRESET_CATEGORIES_ORDERED = (
  Object.keys(
    SYSTEM_TABLE_VIEW_PRESET_CATEGORY_META,
  ) as SystemTableViewPresetCategory[]
).sort(
  (a, b) =>
    SYSTEM_TABLE_VIEW_PRESET_CATEGORY_META[a].order -
    SYSTEM_TABLE_VIEW_PRESET_CATEGORY_META[b].order,
);

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
