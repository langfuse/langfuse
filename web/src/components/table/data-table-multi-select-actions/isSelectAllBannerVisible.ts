import { type MultiSelect } from "@/src/components/table/data-table-toolbar";

/** Every row of a first page that has more pages is selected, so selecting across pages is on offer. */
export function isSelectAllBannerVisible(multiSelect: MultiSelect): boolean {
  if (multiSelect.pageIndex !== 0 || multiSelect.selectedRowIds.length === 0) {
    return false;
  }
  if (multiSelect.totalCount !== null) {
    return (
      multiSelect.totalCount > multiSelect.pageSize &&
      multiSelect.selectedRowIds.length ===
        Math.min(multiSelect.pageSize, multiSelect.totalCount)
    );
  }
  return (
    multiSelect.hasNextPage === true &&
    multiSelect.selectedRowIds.length === multiSelect.pageSize
  );
}
