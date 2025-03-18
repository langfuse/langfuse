import { type MultiSelect } from "@/src/components/table/data-table-toolbar";
import { Button } from "@/src/components/ui/button";

export function DataTableSelectAllBanner({
  selectAll,
  setSelectAll,
  setRowSelection,
  pageSize,
  totalCount,
}: MultiSelect) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-center gap-2 rounded-sm bg-input p-2 @container">
      {selectAll ? (
        <span className="text-sm">
          All <span className="font-semibold">{totalCount}</span> items are
          selected.{" "}
          <Button
            variant="ghost"
            className="h-auto p-0 font-semibold text-accent-dark-blue hover:text-accent-dark-blue/80"
            onClick={() => {
              setSelectAll(false);
              setRowSelection({});
            }}
          >
            Clear selection
          </Button>
        </span>
      ) : (
        <span className="text-sm">
          All <span className="font-semibold">{pageSize}</span> items on this
          page are selected.{" "}
          <Button
            variant="ghost"
            className="h-auto p-0 font-semibold text-accent-dark-blue hover:text-accent-dark-blue/80"
            onClick={() => {
              setSelectAll(true);
            }}
          >
            Select all {totalCount} items
          </Button>
        </span>
      )}
    </div>
  );
}
