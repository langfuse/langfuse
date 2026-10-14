import {
  createTableSelectionStore,
  type TableSelectionStore,
} from "@/src/app/tables/common-components/table-selection-store";

export type EvaluatorsTableStore = TableSelectionStore;
export const createEvaluatorsTableStore = createTableSelectionStore;
