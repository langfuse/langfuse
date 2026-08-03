import { type ColumnDefinition, type FilterState } from "@langfuse/shared";
import { useState } from "react";

import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";

export type ModernSessionFilterDialogViewActions =
  | { type: "none" }
  | {
      type: "create";
      onCreate: (filters: FilterState) => void;
    }
  | {
      type: "update";
      viewName: string;
      isUpdating: boolean;
      onCreate: (filters: FilterState) => void;
      onUpdate: (filters: FilterState) => void;
    };

type ModernSessionFilterDialogContentProps = {
  initialFilters: FilterState;
  filterColumns: ColumnDefinition[];
  filterColumnsWithCustomSelect: string[];
  viewActions: ModernSessionFilterDialogViewActions;
  onCancel: () => void;
  onApplyFilters: (filters: FilterState) => void;
};

export function ModernSessionFilterDialogContent({
  initialFilters,
  filterColumns,
  filterColumnsWithCustomSelect,
  viewActions,
  onCancel,
  onApplyFilters,
}: ModernSessionFilterDialogContentProps) {
  const [filters, setFilters] = useState(initialFilters);

  return (
    <DialogContent size="lg">
      <DialogHeader>
        <DialogTitle>Filter observations</DialogTitle>
      </DialogHeader>
      <DialogBody className="overflow-y-auto">
        <InlineFilterBuilder
          columns={filterColumns}
          filterState={filters}
          onChange={setFilters}
          columnsWithCustomSelect={filterColumnsWithCustomSelect}
        />
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {viewActions.type !== "none" ? (
          <Button
            variant="outline"
            onClick={() => viewActions.onCreate(filters)}
          >
            Save as new view
          </Button>
        ) : null}
        {viewActions.type === "update" ? (
          <Button
            variant="outline"
            loading={viewActions.isUpdating}
            onClick={() => viewActions.onUpdate(filters)}
          >
            Update &quot;{viewActions.viewName}&quot;
          </Button>
        ) : null}
        <Button onClick={() => onApplyFilters(filters)}>Apply filters</Button>
      </DialogFooter>
    </DialogContent>
  );
}
