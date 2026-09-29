import { type ColumnDefinition, type MultiValueOption } from "..";
import { formatColumnOptions } from "./typeHelpers";

export const datasetRunItemsTableCols: ColumnDefinition[] = [
  {
    name: "Scores (numeric)",
    id: "agg_scores_avg",
    type: "numberObject",
    internal: "agg_scores_avg",
    nullable: true,
  },
  {
    name: "Scores (categorical)",
    id: "agg_score_categories",
    type: "categoryOptions",
    internal: "agg_score_categories",
    options: [], // to be filled in at runtime
    nullable: true,
  },
  {
    name: "Scores (boolean)",
    id: "agg_score_booleans",
    type: "booleanObject",
    internal: "agg_score_booleans",
    nullable: true,
  },
];

export type DatasetRunItemsOptions = {
  agg_scores_avg?: Array<string>;
  agg_score_categories?: Array<MultiValueOption>;
  agg_score_booleans?: Array<string>;
};

export function datasetRunItemsTableColsWithOptions(
  options?: DatasetRunItemsOptions,
  cols: ColumnDefinition[] = datasetRunItemsTableCols,
): ColumnDefinition[] {
  return cols.map((col) => {
    if (col.id === "agg_scores_avg") {
      return formatColumnOptions(col, options?.agg_scores_avg ?? []);
    }
    if (col.id === "agg_score_categories") {
      return formatColumnOptions(col, options?.agg_score_categories ?? []);
    }
    if (col.id === "agg_score_booleans") {
      return formatColumnOptions(col, options?.agg_score_booleans ?? []);
    }
    return col;
  });
}
