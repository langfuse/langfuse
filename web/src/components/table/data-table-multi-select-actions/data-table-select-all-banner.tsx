import { type MultiSelect } from "@/src/components/table/data-table-toolbar";
import { Button } from "@/src/components/ui/button";
import { numberFormatter } from "@/src/utils/numbers";
import { useTranslations } from "next-intl";

export function DataTableSelectAllBanner({
  selectAll,
  setSelectAll,
  setRowSelection,
  pageSize,
  totalCount,
  approximateCount,
}: MultiSelect) {
  const t = useTranslations("sharedUi.table.selectionBanner");
  const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : null;
  // Hide the precise number when the row count is not the affected-entity count.
  const exactCount = approximateCount ? null : totalCount;

  return (
    <div className="bg-light-blue/40 dark:bg-light-blue/50 @container mb-2 flex flex-wrap items-center justify-center gap-2 rounded-sm p-2">
      {selectAll ? (
        <span className="text-sm">
          {exactCount === null
            ? t.rich("allMatchingSelected", {
                strong: (chunks) => <span className="font-bold">{chunks}</span>,
              })
            : t.rich("allSelected", {
                count: numberFormatter(exactCount, 0),
                strong: (chunks) => <span className="font-bold">{chunks}</span>,
              })}{" "}
          <Button
            variant="ghost"
            className="text-accent-dark-blue hover:text-accent-dark-blue/80 h-auto p-0 font-bold"
            onClick={() => {
              setSelectAll(false);
              setRowSelection({});
            }}
          >
            {t("clearSelection")}
          </Button>
        </span>
      ) : (
        <span className="text-sm">
          {t.rich("pageSelected", {
            count: numberFormatter(pageSize, 0),
            strong: (chunks) => <span className="font-bold">{chunks}</span>,
          })}{" "}
          <Button
            variant="ghost"
            className="text-accent-dark-blue hover:text-accent-dark-blue/80 h-auto p-0 font-bold"
            onClick={() => {
              setSelectAll(true);
            }}
          >
            {exactCount === null || totalPages === null
              ? t("selectAllMatching")
              : t("selectAcrossPages", {
                  items: numberFormatter(exactCount, 0),
                  pages: numberFormatter(totalPages, 0),
                })}
          </Button>
        </span>
      )}
    </div>
  );
}
