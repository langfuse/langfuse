import {
  createTableSelectionStore,
  type TableSelectionStore,
} from "@/src/components/table/table-selection-store";

export type EvaluatorsTableStore = TableSelectionStore;
export const createEvaluatorsTableStore = createTableSelectionStore;
