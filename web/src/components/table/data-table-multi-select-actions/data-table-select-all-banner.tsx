import { type MultiSelect } from "@/src/components/table/data-table-toolbar";
import { Button } from "@/src/components/ui/button";
import { numberFormatter } from "@/src/utils/numbers";

export function DataTableSelectAllBanner({
  selectAll,
  setSelectAll,
  setRowSelection,
  pageSize,
  totalCount,
}: MultiSelect) {
  const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : 0;

  return (
    <div className="bg-input @container mb-2 flex flex-wrap items-center justify-center gap-2 rounded-sm p-2">
      {selectAll ? (
        <span className="text-sm">
          All{" "}
          <span className="font-semibold">
            {numberFormatter(totalCount ?? 0, 0)}
          </span>{" "}
          items are selected.{" "}
          <Button
            variant="ghost"
            className="text-accent-dark-blue hover:text-accent-dark-blue/80 h-auto p-0 font-semibold"
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
            className="text-accent-dark-blue hover:text-accent-dark-blue/80 h-auto p-0 font-semibold"
            onClick={() => {
              setSelectAll(true);
            }}
          >
            Select all {numberFormatter(totalCount ?? 0, 0)} items across{" "}
            {numberFormatter(totalPages, 0)} pages
          </Button>
        </span>
      )}
    </div>
  );
}
