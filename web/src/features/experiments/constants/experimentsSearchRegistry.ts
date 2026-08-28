import {
  fieldRegistryFromColumns,
  type FieldRegistry,
} from "@/src/features/search-bar/lib/fields";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";

import { experimentsFilterConfig } from "@/src/features/experiments/components/table/filter-config";

/**
 * Derived from the sidebar's FACET list, not the raw `ColumnDefinition[]` — the
 * facets are the view's curated filter surface, so the bar stays a strict subset
 * of the sidebar and cannot author a filter the sidebar is unable to show or
 * clear. See `features/search-bar/README.md` ("Extending to other views").
 */
function facetColumns(config: FilterConfig) {
  const exposed = new Set(config.facets.map((facet) => facet.column));
  return config.columnDefinitions.filter(
    (column) => exposed.has(column.id) && !EXCLUDED_COLUMN_IDS.has(column.id),
  );
}

const AI_CONTEXT_FIELDS = [
  { observedOptionsKey: "name", promptLabel: "name" },
  {
    observedOptionsKey: "experimentDatasetName",
    promptLabel: "experimentDatasetName (dataset)",
  },
] as const;

/**
 * Score filtering stays in the sidebar on this surface, deliberately.
 *
 * The grammar lowers `scores.<name>` onto the canonical `scores_avg` /
 * `score_categories` / `score_booleans` columns (`SCORE_COLUMNS`, applied
 * unconditionally by the adapter). Experiments names its score columns
 * `obs_*` / `trace_*`, so a `scores.` token here would emit a filter on a
 * column this view does not have. Renaming those columns is exactly what the
 * score-unification change does, so `scores.` arrives with it rather than
 * shipping broken now. These columns are dropped from the derived field list
 * too: `obs_score_categories` is `categoryOptions`, not `*Object`, so the
 * helper's keyed-score exclusion does not catch it and it would otherwise
 * surface as a bogus keyless field.
 */
const EXCLUDED_COLUMN_IDS: ReadonlySet<string> = new Set([
  "obs_scores_avg",
  "obs_score_categories",
  "obs_score_booleans",
  "trace_scores_avg",
  "trace_score_categories",
  "trace_score_booleans",
]);

/**
 * Grammar overlay: aliases, units and prose that `ColumnDefinition` does not
 * carry. Units matter because every run metric here is a magnitude someone
 * types with an implied unit (`cost:>1`, `latency:>30`).
 */
const EXPERIMENT_FIELD_OVERLAY = {
  name: {
    aliases: ["experimentname", "experiment_name", "experiment"],
    label: "Experiment name",
    description: "Experiment name",
  },
  experimentDatasetName: {
    aliases: ["dataset", "datasetname", "dataset_name"],
    label: "Dataset",
    description: "Dataset the experiment ran against",
  },
};

export const EXPERIMENTS_FIELD_REGISTRY: FieldRegistry =
  fieldRegistryFromColumns(facetColumns(experimentsFilterConfig), {
    id: "experiments",
    metadata: true,
    // `scores.<name>` lowers onto the canonical `scores_avg` /
    // `score_categories` / `score_booleans` columns, which is exactly what this
    // view filters on since the score unification — so the bar can render a
    // score filter the sidebar set, and parse one the user types. `traceScores.`
    // stays closed: the level-agnostic columns already match at trace level, and
    // the `trace_*` columns are no longer offered.
    scores: true,
    traceScores: false,
    allowFreeText: false,
    // `name` is the only text column, and it is what people look a run up by.
    defaultTextField: "name",
    recentSearches: true,
    searchExamples: [
      "dataset:legal-answer-quality",
      "name:sonnet",
      "scores.groundedness:>0.8",
    ],
    aiContextFields: AI_CONTEXT_FIELDS,
    fields: EXPERIMENT_FIELD_OVERLAY,
  });
