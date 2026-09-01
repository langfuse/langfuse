/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/src/components/ui/dropdown-menu";
import useLocalStorage from "@/src/components/useLocalStorage";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Rows3, Rows2, Rows4 } from "lucide-react";

const heightOptions = [
  { id: "s", label: "Small", icon: <Rows4 /> },
  { id: "m", label: "Medium", icon: <Rows3 /> },
  { id: "l", label: "Large", icon: <Rows2 /> },
] as const;

const defaultHeights: Record<RowHeight, string> = {
  s: "h-7", // after removing the container around IO, we want the row height a bit more than 6
  m: "h-24",
  l: "h-64",
};

export type RowHeight = (typeof heightOptions)[number]["id"];
export type CustomHeights = Record<RowHeight, string>;

/**
 * Chars of Input/Output a taller row needs to fill its cells. Small shows a
 * single truncated line, so it stays on the cheap pre-truncated read; Medium
 * and Large have room for far more text than that (LFE-14586). Sized to fill a
 * Large row even at a generously widened column.
 */
const EXPANDED_ROW_IO_CHAR_LIMIT = 2_000;

/** Undefined for Small, which keeps the default truncated read. */
export const getRowHeightIOCharLimit = (rowHeight: RowHeight) =>
  rowHeight === "s" ? undefined : EXPANDED_ROW_IO_CHAR_LIMIT;

export const getRowHeightTailwindClass = (
  rowHeight?: RowHeight,
  customHeights?: CustomHeights,
) => {
  if (!rowHeight) return undefined;
  return customHeights?.[rowHeight] || defaultHeights[rowHeight];
};

export function useRowHeightLocalStorage(
  tableName: string,
  defaultValue: RowHeight,
) {
  const [rowHeight, setRowHeight, clearRowHeight] = useLocalStorage<RowHeight>(
    `${tableName}Height`,
    defaultValue,
  );

  return [rowHeight, setRowHeight, clearRowHeight] as const;
}

export const DataTableRowHeightSwitch = ({
  rowHeight,
  setRowHeight,
  tableName = "unknown",
  isV4 = false,
}: {
  rowHeight: RowHeight;
  setRowHeight: (e: RowHeight) => void;
  tableName?: string;
  isV4?: boolean;
}) => {
  const capture = usePostHogClientCapture();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title="Row height">
          <Rows3 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent>
          <DropdownMenuLabel>Row height</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {heightOptions.map(({ id, label }) => (
            <DropdownMenuCheckboxItem
              key={id}
              checked={rowHeight === id}
              onClick={(e) => {
                // Prevent closing the dropdown menu to allow the user to adjust their selection
                e.preventDefault();
                capture("table:row_height_switch_select", {
                  rowHeight: id,
                  tableName,
                  isV4,
                });
                setRowHeight(id);
              }}
            >
              {label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
};
