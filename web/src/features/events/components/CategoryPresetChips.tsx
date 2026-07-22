import { useMemo, useRef } from "react";
import { DollarSign, ThumbsDown, Timer, type LucideIcon } from "lucide-react";
import {
  SYSTEM_TABLE_VIEW_PRESET_CATEGORIES_ORDERED,
  SYSTEM_TABLE_VIEW_PRESET_CATEGORY_META,
  SystemTableViewPresetCategory,
  TableViewPresetTableName,
  type TableViewPresetState,
} from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";
import { useViewData } from "@/src/components/table/table-view-presets/hooks/useViewData";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const CATEGORY_ICONS: Record<SystemTableViewPresetCategory, LucideIcon> = {
  [SystemTableViewPresetCategory.SlowCalls]: Timer,
  [SystemTableViewPresetCategory.Errors]: ThumbsDown,
  [SystemTableViewPresetCategory.CostRegression]: DollarSign,
};

type PresetItem = {
  id: string;
  name: string;
  description?: string;
  // The filters/orderBy this preset applies. Absent for the disabled
  // coming-soon placeholder.
  state?: TableViewPresetState;
  // A non-interactive "coming soon" placeholder (e.g. Low quality), rendered
  // greyed with a "Soon" badge and no apply behavior.
  disabled?: boolean;
};

// Applied on toggle-off: clears the preset's filters and sort back to the
// table's unfiltered default (mirrors an empty system preset).
const CLEARED_VIEW_STATE: TableViewPresetState = {
  filters: [],
  orderBy: null,
  columnOrder: [],
  columnVisibility: {},
  searchQuery: "",
};

// Coming-soon placeholder shown under "Quality & Errors". Real, project-scoped
// quality presets (eval scores + feedback) are a follow-up; this signals intent
// without doing anything.
const LOW_QUALITY_COMING_SOON: PresetItem = {
  id: "__coming_soon_low_quality",
  name: "Low quality",
  description:
    "Surface low eval scores & negative feedback — e.g. faithfulness < 0.7, CSAT ≤ 3",
  disabled: true,
};

type CategoryPresetChipsProps = {
  projectId: string;
  /** The currently applied view id, used to render the active chip/row state. */
  activeViewId: string | null;
  /** Sets `?viewId` (deep-link/provenance); pass null to deselect. */
  onApplyView: (viewId: string | null) => void;
  /** Applies the preset's filters/orderBy to the live table. Accepts the
   * analytics `meta` (LFE-10781) so chip applies/toggle-offs emit
   * `saved_views:applied` — the capture is gated on `meta` being passed. */
  applyViewState: (
    viewData: TableViewPresetState,
    meta?: {
      trigger:
        | "select"
        | "permalink"
        | "default"
        | "system_preset"
        | "system_preset_cleared";
      viewId?: string | null;
    },
  ) => void;
  /**
   * Non-destructive preview of a preset's filters in the search bar while
   * hovering/focusing its row; pass null to restore. No-op when the search bar
   * isn't active.
   */
  onPreviewView?: (viewData: TableViewPresetState | null) => void;
};

/**
 * Quick-access preset chips grouped by category, rendered beneath the search
 * bar on the v4 observations/events table. Each chip opens a popover listing
 * the category's system presets; selecting one applies it through the shared
 * table-view manager (which sets `?viewId` for deep-linkable state).
 */
export function CategoryPresetChips({
  projectId,
  activeViewId,
  onApplyView,
  applyViewState,
  onPreviewView,
}: CategoryPresetChipsProps) {
  const capture = usePostHogClientCapture();
  const { TableViewPresetsList } = useViewData({
    tableName: TableViewPresetTableName.ObservationsEvents,
    projectId,
  });
  // Pointer opens suppress Radix's focus-first-row so clicking a chip doesn't
  // instantly fire the first row's focus-preview; keyboard opens keep it, or
  // Tab would exit the (portaled) popover and rows would be unreachable.
  // Two refs because the pointerdown flag must survive until onOpenChange(true)
  // consumes it: switching chip→chip, the OLD popover's close (an outside-
  // pointerdown dismiss) happens between the new trigger's pointerdown and its
  // open, so clearing on close would drop the flag. Shared across the chips —
  // only one popover interaction happens at a time.
  const pointerDownRef = useRef(false);
  const openedByPointerRef = useRef(false);

  // Explore → activate funnel: one close event carries how long the popover
  // was open and how the interaction ended, so dwell time and conversion read
  // without stitching opens to applies. Shared across the chips — only one
  // popover interaction happens at a time; chip→chip switching closes the old
  // popover (capturing ITS outcome via its own closure) before the new opens.
  const openedAtRef = useRef<number | null>(null);
  const outcomeRef = useRef<
    "no_interaction" | "previewed_only" | "applied" | "cleared"
  >("no_interaction");
  const markExplored = () => {
    if (outcomeRef.current === "no_interaction")
      outcomeRef.current = "previewed_only";
  };

  const presetsByCategory = useMemo(() => {
    // While the preset list is loading, render no chips at all (null below)
    // rather than a lone Quality chip holding just the coming-soon placeholder
    // — the other chips popping in on response would shift the toolbar row.
    if (!TableViewPresetsList) return null;
    const grouped = new Map<SystemTableViewPresetCategory, PresetItem[]>();
    for (const view of TableViewPresetsList) {
      if (!view.category) continue;
      const list = grouped.get(view.category) ?? [];
      list.push({
        id: view.id,
        name: view.name,
        description: view.description,
        state: {
          filters: view.filters,
          orderBy: view.orderBy,
          columnOrder: view.columnOrder,
          columnVisibility: view.columnVisibility,
          searchQuery: view.searchQuery,
        },
      });
      grouped.set(view.category, list);
    }
    // Quality lives under the Errors ("Quality & Errors") chip as a
    // coming-soon placeholder for now — but only alongside real presets, so a
    // catalog without categorized presets renders no chips (guard below).
    const errorsList = grouped.get(SystemTableViewPresetCategory.Errors);
    if (errorsList) {
      grouped.set(SystemTableViewPresetCategory.Errors, [
        ...errorsList,
        LOW_QUALITY_COMING_SOON,
      ]);
    }
    return grouped;
  }, [TableViewPresetsList]);

  const categories = presetsByCategory
    ? SYSTEM_TABLE_VIEW_PRESET_CATEGORIES_ORDERED.filter(
        (category) => (presetsByCategory.get(category)?.length ?? 0) > 0,
      )
    : [];

  if (!presetsByCategory || categories.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {categories.map((category) => {
        const presets = presetsByCategory.get(category) ?? [];
        const Icon = CATEGORY_ICONS[category];
        const { label } = SYSTEM_TABLE_VIEW_PRESET_CATEGORY_META[category];
        const isCategoryActive = presets.some(
          (preset) => preset.id === activeViewId,
        );

        return (
          <Popover
            key={category}
            onOpenChange={(open) => {
              if (open) {
                openedByPointerRef.current = pointerDownRef.current;
                pointerDownRef.current = false;
                openedAtRef.current = Date.now();
                outcomeRef.current = "no_interaction";
                capture("saved_views:category_chip_open", {
                  category,
                  tableName: TableViewPresetTableName.ObservationsEvents,
                });
              } else {
                // The popover can close without a row leave/blur firing
                // (select a preset, click outside, Escape) — always end the
                // preview so it can't outlive the popover.
                onPreviewView?.(null);
                if (openedAtRef.current !== null) {
                  capture("saved_views:category_chip_close", {
                    category,
                    outcome: outcomeRef.current,
                    durationMs: Date.now() - openedAtRef.current,
                    tableName: TableViewPresetTableName.ObservationsEvents,
                  });
                  openedAtRef.current = null;
                }
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                onPointerDown={() => {
                  pointerDownRef.current = true;
                }}
                onKeyDown={(event) => {
                  // Keyboard activation explicitly marks a non-pointer open,
                  // clearing a stale flag from a pointer toggle-close.
                  if (event.key === "Enter" || event.key === " ")
                    pointerDownRef.current = false;
                }}
                className={cn("gap-1.5", isCategoryActive && "bg-primary/5")}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-72 p-1"
              onOpenAutoFocus={(event) => {
                // See openedByPointerRef: a pointer open keeps focus on the
                // trigger (no instant first-row focus-preview); a keyboard
                // open lets Radix focus the first row so the presets stay
                // keyboard-reachable — previewing the row focus lands on is
                // then the expected behavior.
                if (openedByPointerRef.current) event.preventDefault();
              }}
            >
              <div className="text-muted-foreground px-2 py-1.5 text-xs font-bold">
                {label}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {presets.map((preset) => {
                  const isPresetActive =
                    !preset.disabled && preset.id === activeViewId;
                  const row = (
                    <button
                      type="button"
                      // aria-disabled (not disabled) so the coming-soon row
                      // still receives clicks — captured below as a demand
                      // signal for the follow-up quality presets.
                      aria-disabled={preset.disabled || undefined}
                      onMouseEnter={() => {
                        if (!preset.state) return;
                        markExplored();
                        onPreviewView?.(preset.state);
                        capture("saved_views:category_preset_preview", {
                          category,
                          presetId: preset.id,
                          presetName: preset.name,
                          tableName:
                            TableViewPresetTableName.ObservationsEvents,
                        });
                      }}
                      onMouseLeave={() =>
                        !preset.disabled && onPreviewView?.(null)
                      }
                      onFocus={() => {
                        if (!preset.state) return;
                        markExplored();
                        onPreviewView?.(preset.state);
                      }}
                      onBlur={() => !preset.disabled && onPreviewView?.(null)}
                      onClick={() => {
                        if (!preset.state) {
                          markExplored();
                          capture(
                            "saved_views:category_preset_coming_soon_click",
                            {
                              category,
                              presetId: preset.id,
                              presetName: preset.name,
                              tableName:
                                TableViewPresetTableName.ObservationsEvents,
                            },
                          );
                          return;
                        }
                        // Set ?viewId for deep-link/provenance, then apply the
                        // preset's filters/orderBy (or clear on toggle-off).
                        const next = isPresetActive ? null : preset.id;
                        outcomeRef.current = next ? "applied" : "cleared";
                        onApplyView(next);
                        // Pass analytics meta so the chip apply / toggle-off
                        // emits `saved_views:applied` (LFE-10781): applying a
                        // preset is a "system_preset" trigger; toggling it off
                        // applies the cleared/default state.
                        applyViewState(
                          next ? preset.state : CLEARED_VIEW_STATE,
                          {
                            trigger: next
                              ? "system_preset"
                              : "system_preset_cleared",
                            viewId: next,
                          },
                        );
                        capture("saved_views:category_chip_apply", {
                          category,
                          presetId: preset.id,
                          presetName: preset.name,
                          action: next ? "apply" : "clear",
                          tableName:
                            TableViewPresetTableName.ObservationsEvents,
                        });
                      }}
                      className={cn(
                        "flex w-full items-start justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                        preset.disabled
                          ? "cursor-default opacity-60"
                          : "hover:bg-accent",
                      )}
                    >
                      <span className="flex flex-col">
                        <span className="flex items-center gap-1.5 font-bold">
                          {preset.name}
                          {preset.disabled && (
                            <span className="text-muted-foreground rounded-sm border px-1 text-[10px] font-normal uppercase">
                              Soon
                            </span>
                          )}
                        </span>
                        {preset.description && (
                          <span className="text-muted-foreground text-xs">
                            {preset.description}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                  // The disabled placeholder never applies, so it isn't wrapped
                  // in PopoverClose (clicking it should not close the popover).
                  return preset.disabled ? (
                    <div key={preset.id}>{row}</div>
                  ) : (
                    <PopoverClose asChild key={preset.id}>
                      {row}
                    </PopoverClose>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}
