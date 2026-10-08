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
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { Rows3, Rows2, Rows4 } from "lucide-react";
import { useCallback } from "react";

const ROW_HEIGHT_OPTIONS = [
  { id: "s", label: "Small", icon: <Rows4 className="icon-base" /> },
  { id: "m", label: "Medium", icon: <Rows3 className="icon-base" /> },
  { id: "l", label: "Large", icon: <Rows2 className="icon-base" /> },
] as const;

const defaultHeights: Record<RowHeight, string> = {
  s: "h-7", // after removing the container around IO, we want the row height a bit more than 6
  m: "h-24",
  l: "h-64",
};

export type RowHeight = (typeof ROW_HEIGHT_OPTIONS)[number]["id"];
export type CustomHeights = Record<RowHeight, string>;

/** Free row heights stay inside this range. Below it a row stops being readable; above it the page is mostly one cell. */
export const MIN_CUSTOM_ROW_HEIGHT_PX = 48;
export const MAX_CUSTOM_ROW_HEIGHT_PX = 4_000;

const ROW_HEIGHT_IDS = new Set<string>(
  ROW_HEIGHT_OPTIONS.map((option) => option.id),
);

/**
 * Persisted row height for one table. A bare preset is what every table stored
 * before a free height existed. After a drag, the object keeps that preset so
 * it can be restored without dropping the free height.
 */
export type StoredRowHeight =
  | RowHeight
  | {
      preset: RowHeight;
      mode: "preset" | "custom";
      customPx: number | null;
    };

export type ResolvedRowHeight = {
  preset: RowHeight;
  mode: "preset" | "custom";
  /** Last free height, whether or not it is the one on screen. */
  customPx: number | null;
};

/** Menu state for a table that lets the user drag a free height. */
export type CustomRowHeightControl = {
  /** True while the free height is what the table shows. */
  active: boolean;
  /** Last free height. Null until the user drags a row. */
  rememberedPx: number | null;
  onSelect: () => void;
};

const isRowHeight = (value: unknown): value is RowHeight =>
  typeof value === "string" && ROW_HEIGHT_IDS.has(value);

export function clampCustomRowHeightPx(heightPx: number): number {
  if (!Number.isFinite(heightPx)) return MIN_CUSTOM_ROW_HEIGHT_PX;
  return Math.min(
    MAX_CUSTOM_ROW_HEIGHT_PX,
    Math.max(MIN_CUSTOM_ROW_HEIGHT_PX, Math.round(heightPx)),
  );
}

export function resolveStoredRowHeight(
  stored: unknown,
  fallbackPreset: RowHeight,
): ResolvedRowHeight {
  if (isRowHeight(stored)) {
    return { preset: stored, mode: "preset", customPx: null };
  }

  if (!stored || typeof stored !== "object") {
    return { preset: fallbackPreset, mode: "preset", customPx: null };
  }

  const record = stored as Record<string, unknown>;
  const preset = isRowHeight(record.preset) ? record.preset : fallbackPreset;
  const customPx =
    typeof record.customPx === "number"
      ? clampCustomRowHeightPx(record.customPx)
      : null;
  const mode =
    record.mode === "custom" && customPx != null ? "custom" : "preset";

  return { preset, mode, customPx };
}

/**
 * Chars of Input/Output a taller row needs to fill its cells. A compact row
 * shows a single truncated line, so it stays on the cheap pre-truncated read.
 * Taller rows have room for far more text than that. Sized to fill a Large
 * row even at a generously widened column.
 */
const EXPANDED_ROW_IO_CHAR_LIMIT = 2_000;

/** Pixel height of a Tailwind `h-*` step at the default 16px root. */
const TAILWIND_HEIGHT_STEP_PX = 4;

/**
 * Pixel height of this table's Medium preset. A dragged height uses that
 * line to decide between a truncated line and a wrapped preview.
 */
export function mediumRowHeightPx(customHeights?: CustomHeights): number {
  const heightClass = customHeights?.m ?? defaultHeights.m;
  const steps = /^h-(\d+(?:\.\d+)?)$/.exec(heightClass)?.[1];
  if (steps == null) return 96;
  return Number(steps) * TAILWIND_HEIGHT_STEP_PX;
}

/**
 * One truncated line, or room to wrap.
 * Preset Small is the truncated line. Medium and Large wrap.
 * A dragged height uses the same line: below this table's Medium height it
 * stays truncated, and at Medium or taller it wraps. Growing and shrinking
 * cross that line the same way.
 */
export function isCompactRowHeight(
  rowHeight: RowHeight,
  mode: "preset" | "custom",
  heightPx?: number | null,
  mediumPx?: number,
): boolean {
  if (mode !== "custom") return rowHeight === "s";
  if (heightPx == null) return false;
  return heightPx < (mediumPx ?? mediumRowHeightPx());
}

/** Undefined while the row shows one truncated line; otherwise the expanded read. */
export const getRowHeightIOCharLimit = (
  rowHeight: RowHeight,
  mode: "preset" | "custom" = "preset",
  heightPx?: number | null,
  mediumPx?: number,
) =>
  isCompactRowHeight(rowHeight, mode, heightPx, mediumPx)
    ? undefined
    : EXPANDED_ROW_IO_CHAR_LIMIT;

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
  const adjustable = useAdjustableRowHeight(tableName, defaultValue);

  return [adjustable.preset, adjustable.setPreset, adjustable] as const;
}

/**
 * Preset plus an optional free height, in the same per-table localStorage key
 * as `useRowHeightLocalStorage`. A previously saved preset string still loads.
 */
export function useAdjustableRowHeight(
  tableName: string,
  defaultPreset: RowHeight,
) {
  const [stored, setStored] = useLocalStorage<StoredRowHeight>(
    `${tableName}Height`,
    defaultPreset,
  );
  const resolved = resolveStoredRowHeight(stored, defaultPreset);

  const setPreset = useCallback(
    (preset: RowHeight) => {
      setStored((current) => {
        const previous = resolveStoredRowHeight(current, defaultPreset);
        return { preset, mode: "preset", customPx: previous.customPx };
      });
    },
    [defaultPreset, setStored],
  );

  const setCustomPx = useCallback(
    (heightPx: number) => {
      setStored((current) => {
        const previous = resolveStoredRowHeight(current, defaultPreset);
        return {
          preset: previous.preset,
          mode: "custom",
          customPx: clampCustomRowHeightPx(heightPx),
        };
      });
    },
    [defaultPreset, setStored],
  );

  const selectCustom = useCallback(() => {
    setStored((current) => {
      const previous = resolveStoredRowHeight(current, defaultPreset);
      if (previous.customPx == null) return previous.preset;
      return {
        preset: previous.preset,
        mode: "custom",
        customPx: previous.customPx,
      };
    });
  }, [defaultPreset, setStored]);

  return {
    preset: resolved.preset,
    mode: resolved.mode,
    customPx: resolved.customPx,
    activeHeightPx: resolved.mode === "custom" ? resolved.customPx : null,
    setPreset,
    setCustomPx,
    selectCustom,
  };
}

/** Menu props for the row-height switch. Custom stays hidden until a drag. */
export function customRowHeightMenu(adjustable: {
  mode: "preset" | "custom";
  customPx: number | null;
  selectCustom: () => void;
}): CustomRowHeightControl {
  return {
    active: adjustable.mode === "custom",
    rememberedPx: adjustable.customPx,
    onSelect: adjustable.selectCustom,
  };
}

export const DataTableRowHeightSwitch = ({
  rowHeight,
  setRowHeight,
  tableName = "unknown",
  isV4 = false,
  customRowHeight,
}: {
  rowHeight: RowHeight;
  setRowHeight: (e: RowHeight) => void;
  tableName?: string;
  isV4?: boolean;
  /**
   * Pass this wherever the switch is shown. Custom stays hidden until a row
   * has been dragged.
   */
  customRowHeight?: CustomRowHeightControl;
}) => {
  const capture = usePostHogClientCapture();
  const customActive = customRowHeight?.active === true;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          title={customActive ? "Row height: Custom" : "Row height"}
        >
          <Rows3 className="icon-base text-icon-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent>
          <DropdownMenuLabel>Row height</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ROW_HEIGHT_OPTIONS.map(({ id, label }) => (
            <DropdownMenuCheckboxItem
              key={id}
              checked={!customActive && rowHeight === id}
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
          {customRowHeight?.rememberedPx != null && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={customActive}
                onClick={(e) => {
                  e.preventDefault();
                  if (customActive) return;
                  capture("table:row_height_switch_select", {
                    rowHeight: "custom",
                    tableName,
                    isV4,
                  });
                  customRowHeight.onSelect();
                }}
              >
                {`Custom (${customRowHeight.rememberedPx}px)`}
              </DropdownMenuCheckboxItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
};
