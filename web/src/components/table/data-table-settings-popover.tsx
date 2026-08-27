import { type Dispatch, type SetStateAction } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  type ColumnOrderState,
  type VisibilityState,
} from "@tanstack/react-table";
import { Button } from "@/src/components/ui/button";
import { PopoverController } from "@/src/components/ui/popover";
import { Separator } from "@/src/components/ui/separator";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/data-table-column-visibility-filter";
import {
  ROW_HEIGHT_OPTIONS,
  type RowHeight,
} from "@/src/components/table/data-table-row-height-switch";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

/**
 * One "Table settings" surface for the controls that shape the same table —
 * columns and row height — instead of a button per control. Filed against the
 * old compare view as "fields vs. columns confused me as a new user" (LFE-8420)
 * and reproduced by the new experiments UI with one more control.
 *
 * The column list keeps its own drawer: it carries drag-to-reorder, groups and
 * restore-defaults, and it opens from inside this popover rather than from a
 * second button in the toolbar. (LFE-15711)
 */
export function DataTableSettingsPopover<TData, TValue>({
  columns,
  columnVisibility,
  setColumnVisibility,
  columnOrder,
  setColumnOrder,
  rowHeight,
  setRowHeight,
  tableName,
  isV4,
}: {
  columns: LangfuseColumnDef<TData, TValue>[];
  columnVisibility: VisibilityState;
  setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>;
  columnOrder?: ColumnOrderState;
  setColumnOrder?: Dispatch<SetStateAction<ColumnOrderState>>;
  rowHeight: RowHeight;
  setRowHeight: (rowHeight: RowHeight) => void;
  /** Analytics identity (LFE-15720) for the events fired from inside the
   *  popover — the row-height buttons here and the column drawer's toggles. */
  tableName: string;
  isV4: boolean;
}) {
  const capture = usePostHogClientCapture();

  return (
    <PopoverController
      align="end"
      contentClassName="w-60 p-2"
      disabled={false}
      modal={false}
      renderContent={() => (
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-muted-foreground px-1 pb-1 text-xs">Columns</p>
            <DataTableColumnVisibilityFilter
              columns={columns}
              columnVisibility={columnVisibility}
              setColumnVisibility={setColumnVisibility}
              columnOrder={columnOrder}
              setColumnOrder={setColumnOrder}
              triggerLabel="Show / hide"
              tableName={tableName}
              isV4={isV4}
            />
          </div>
          <Separator />
          <div>
            <p className="text-muted-foreground px-1 pb-1 text-xs">
              Row height
            </p>
            <div className="grid grid-cols-3 gap-1">
              {ROW_HEIGHT_OPTIONS.map(({ id, label, icon }) => (
                <Button
                  key={id}
                  variant={rowHeight === id ? "secondary" : "ghost"}
                  aria-pressed={rowHeight === id}
                  className="h-auto flex-col gap-1 py-1.5"
                  onClick={() => {
                    capture("table:row_height_switch_select", {
                      rowHeight: id,
                      tableName,
                      isV4,
                    });
                    setRowHeight(id);
                  }}
                >
                  {icon}
                  <span className="text-xs">{label}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <Button variant="outline" title="Table settings">
            <SlidersHorizontal className="h-4 w-4" />
            <span className="ml-2 hidden md:inline">Table settings</span>
          </Button>
        </Trigger>
      )}
    </PopoverController>
  );
}
