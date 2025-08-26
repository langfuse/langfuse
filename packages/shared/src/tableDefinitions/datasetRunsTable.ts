import { type ColumnDefinition, type MultiValueOption } from "..";
import { formatColumnOptions } from "./typeHelpers";

export const datasetRunsTableCols: ColumnDefinition[] = [
  {
    name: "[Agg] Scores (numeric)",
    id: "agg_scores_avg",
    type: "numberObject",
    internal: "agg_scores_avg",
    nullable: true,
  },
  {
    name: "[Agg] Scores (categorical)",
    id: "agg_score_categories",
    type: "categoryOptions",
    internal: "agg_score_categories",
    options: [], // to be filled in at runtime
    nullable: true,
  },
  {
    name: "[Run] Scores (numeric)",
    id: "run_scores_avg",
    type: "numberObject",
    internal: "run_scores_avg",
    nullable: true,
  },
  {
    name: "[Run] Scores (categorical)",
    id: "run_score_categories",
    type: "categoryOptions",
    internal: "run_score_categories",
    options: [], // to be filled in at runtime
    nullable: true,
  },
];

export type DatasetRunsOptions = {
  agg_scores_avg?: Array<string>;
  agg_score_categories?: Array<MultiValueOption>;
  run_scores_avg?: Array<string>;
  run_score_categories?: Array<MultiValueOption>;
};

export function datasetRunsTableColsWithOptions(
  options?: DatasetRunsOptions,
  cols: ColumnDefinition[] = datasetRunsTableCols,
): ColumnDefinition[] {
  return cols.map((col) => {
    if (col.id === "agg_scores_avg") {
      return formatColumnOptions(col, options?.agg_scores_avg ?? []);
    }
    if (col.id === "agg_score_categories") {
      return formatColumnOptions(col, options?.agg_score_categories ?? []);
    }
    if (col.id === "run_scores_avg") {
      return formatColumnOptions(col, options?.run_scores_avg ?? []);
    }
    if (col.id === "run_score_categories") {
      return formatColumnOptions(col, options?.run_score_categories ?? []);
    }
    return col;
  });
}
