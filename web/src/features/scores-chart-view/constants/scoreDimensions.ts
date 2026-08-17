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
 */
export const getScoreDimensionsForDataset = (
  dataset: ScoreChartDataset,
): ScoreDimensionDef[] => {
  const { dimensions } = viewDeclarations.v2[VIEW_BY_DATASET[dataset]];
  const options = Object.entries(dimensions)
    .filter(([, def]) => !def.uiHidden)
    .map(([key]) => ({ key, label: startCase(key), field: key }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
    );
  return [NO_BREAKDOWN, ...options];
};
