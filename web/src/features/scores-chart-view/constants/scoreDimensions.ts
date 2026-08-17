import startCase from "lodash/startCase";
import { viewDeclarations } from "@langfuse/shared";
import { VIEW_BY_DATASET } from "@/src/features/scores-chart-view/constants/viewByDataset";
import {
  type ScoreChartDataset,
  type ScoreDimensionDef,
} from "@/src/features/scores-chart-view/types";

const NO_BREAKDOWN: ScoreDimensionDef = {
  key: "none",
  label: "Total (no breakdown)",
  field: null,
};

/**
 * The breakdown dimensions offered for a dataset — read straight off the
 * same view declaration the real dashboard widget builder uses
 * (`viewDeclarations` in `packages/shared/src/features/query/dataModel.ts`),
 * with the same `uiHidden` filter and `startCase` labeling `WidgetForm.tsx`'s
 * `availableDimensions` applies. Deliberately NOT a hand-maintained list —
 * a hand-picked subset is exactly what drifted out of sync with the boolean
 * view earlier, and would silently drift again the next time a dimension is
 * added to/removed from a view declaration.
 *
 * `isTimeSeries` additionally excludes `highCardinality` dimensions (id,
 * traceId, observationId, sessionId, userId): the server's `validateQuery`
 * rejects a `timeDimension` query breaking down by one of those with a 422
 * (unbounded result set), so offering them for a time-series chart type
 * would just be a guaranteed error. They stay available for ranked/pie/
 * number charts, which cap rows instead of opening a time axis.
 */
export const getScoreDimensionsForDataset = (
  dataset: ScoreChartDataset,
  isTimeSeries: boolean,
): ScoreDimensionDef[] => {
  const { dimensions } = viewDeclarations.v2[VIEW_BY_DATASET[dataset]];
  const options = Object.entries(dimensions)
    .filter(
      ([, def]) => !def.uiHidden && !(isTimeSeries && def.highCardinality),
    )
    .map(([key]) => ({ key, label: startCase(key), field: key }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
    );
  return [NO_BREAKDOWN, ...options];
};
