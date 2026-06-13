import { type FilterState } from "../../../types";
import { greptimeQuery } from "../../greptime/client";
import { quoteIdent } from "../../greptime/schemaUtils";
import { greptimeTsParam, notDeleted } from "./queryHelpers";

/**
 * GreptimeDB experiment reads (04-read-path.md, P4). An experiment IS a dataset run:
 * `experiment_id == dataset_run_id`, `experiment_item_id == dataset_run_items.dataset_item_id`,
 * `experiment_item_root_span_id == dataset_run_items.observation_id`, and experiment name/description/
 * dataset_id/metadata are denormalized onto `dataset_run_items`. The CH `*FromEvents` readers (which
 * read the `events_*` event-log tables) collapse onto the merged `dataset_run_items` + traces/
 * observations/scores projections here.
 */

const COMPARISON_OPS: Record<string, string> = {
  ">": ">",
  ">=": ">=",
  "<": "<",
  "<=": "<=",
  "=": "=",
};

/**
 * Distinct dataset ids that have experiment (dataset-run) data, optionally bounded by a start-time
 * filter. Replaces the experiments-filterOptions use of `getEventsGroupedByExperimentDatasetId`
 * (`experiment_dataset_id == dataset_id`). The shared events-table function keeps its generic
 * event-filter semantics for the v4 events filter-options path (deferred); this dedicated reader only
 * serves the experiments UI, which uses membership (and an optional Start Time bound) — not the full
 * event filter.
 */
export const getExperimentDatasetIdsGreptime = async (
  projectId: string,
  startTimeFilter?: FilterState,
): Promise<{ experimentDatasetId: string }[]> => {
  const clauses: string[] = [
    "project_id = :projectId",
    `dataset_id IS NOT NULL`,
    `dataset_id != ''`,
    notDeleted(),
  ];
  const params: Record<string, unknown> = { projectId };

  (startTimeFilter ?? []).forEach((f, i) => {
    if (f.type !== "datetime" || !(f.value instanceof Date)) return;
    const op = COMPARISON_OPS[f.operator];
    if (!op) return;
    const key = `st${i}`;
    params[key] = greptimeTsParam(f.value);
    clauses.push(`${quoteIdent("dataset_run_created_at")} ${op} :${key}`);
  });

  const rows = await greptimeQuery<{ experiment_dataset_id: string }>({
    query: `
      SELECT DISTINCT dataset_id AS experiment_dataset_id
      FROM ${quoteIdent("dataset_run_items")}
      WHERE ${clauses.join(" AND ")}
      LIMIT 1000`,
    params,
    readOnly: true,
  });

  return rows.map((r) => ({ experimentDatasetId: r.experiment_dataset_id }));
};
