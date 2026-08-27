import { type MultiSelect } from "@/src/components/table/data-table-toolbar";
import { Button } from "@/src/components/ui/button";
import { numberFormatter } from "@/src/utils/numbers";

export function DataTableSelectAllBanner({
  selectAll,
  setSelectAll,
  setRowSelection,
  pageSize,
  totalCount,
  approximateCount,
}: MultiSelect) {
  const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : null;
  // Hide the precise number when the row count is not the affected-entity count.
  const exactCount = approximateCount ? null : totalCount;

  return (
    <div className="bg-light-blue/40 dark:bg-light-blue/50 @container mb-2 flex flex-wrap items-center justify-center gap-2 rounded-sm p-2">
      {selectAll ? (
        <span className="text-sm">
          All{" "}
          <span className="font-bold">
            {exactCount === null ? "matching" : numberFormatter(exactCount, 0)}
          </span>{" "}
          items are selected.{" "}
          <Button
            variant="ghost"
            className="text-accent-dark-blue hover:text-accent-dark-blue/80 h-auto p-0 font-bold"
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
          All <span className="font-bold">{numberFormatter(pageSize, 0)}</span>{" "}
          items on this page are selected.{" "}
          <Button
            variant="ghost"
            className="text-accent-dark-blue hover:text-accent-dark-blue/80 h-auto p-0 font-bold"
            onClick={() => {
              setSelectAll(true);
            }}
          >
            {exactCount === null || totalPages === null
              ? "Select all matching items"
              : `Select all ${numberFormatter(
                  exactCount,
                  0,
                )} items across ${numberFormatter(totalPages, 0)} pages`}
          </Button>
        </span>
      )}
    </div>
  );
}
