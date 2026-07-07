import { useMemo, useState } from "react";
import {
  DollarSign,
  Loader2,
  ThumbsDown,
  Timer,
  type LucideIcon,
} from "lucide-react";
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
import { useResolvePercentileThreshold } from "@/src/features/events/hooks/useResolvePercentileThreshold";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";

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
  // coming-soon placeholder and for percentile presets (resolved on click).
  state?: TableViewPresetState;
  // A non-interactive "coming soon" placeholder (e.g. Low quality), rendered
  // greyed with a "Soon" badge and no apply behavior.
  disabled?: boolean;
  // Percentile presets resolve their threshold at apply time (snapshot) via
  // the metrics query engine, then apply a plain number filter — so the
  // resulting filter state stays shareable and pagination-stable.
  resolvePercentile?: {
    /** Measure name on the v2 `observations` metrics view. */
    measure: string;
    percentile: "p50" | "p75" | "p90" | "p95" | "p99";
    /** Events-table filter column the resolved threshold is written to. */
    column: string;
    /** Unit conversion measure → filter column (e.g. latency ms → s). */
    toFilterValue?: (value: number) => number;
    orderBy?: TableViewPresetState["orderBy"];
  };
};

// Percentile presets: thresholds are computed over the table's current time
// range (other filters deliberately ignored) and applied as plain filters.
const PERCENTILE_PRESETS: Array<
  PresetItem & { category: SystemTableViewPresetCategory }
> = [
  {
    id: "__pctl_slowest_5pct",
    name: "Slowest 5%",
    description: "Latency above the 95th percentile of the selected range",
    category: SystemTableViewPresetCategory.SlowCalls,
    resolvePercentile: {
      measure: "latency",
      percentile: "p95",
      column: "latency",
      // The latency measure is milliseconds; the filter column is seconds.
      toFilterValue: (ms) => Math.round(ms) / 1000,
      orderBy: { column: "latency", order: "DESC" },
    },
  },
  {
    id: "__pctl_top_5pct_cost",
    name: "Top 5% cost",
    description: "Total cost above the 95th percentile of the selected range",
    category: SystemTableViewPresetCategory.CostRegression,
    resolvePercentile: {
      measure: "totalCost",
      percentile: "p95",
      column: "totalCost",
      toFilterValue: (usd) => Math.round(usd * 1e6) / 1e6,
      orderBy: { column: "totalCost", order: "DESC" },
    },
  },
];

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
  /** Absolute time range of the table — the population percentile presets
   *  resolve their thresholds over (an absent `to` means "until now").
   *  Percentile presets hide when the range is absent. */
  dateRange?: { from: Date; to?: Date };
  /** The currently applied view id, used to render the active chip/row state. */
  activeViewId: string | null;
  /** Sets `?viewId` (deep-link/provenance); pass null to deselect. */
  onApplyView: (viewId: string | null) => void;
  /** Applies the preset's filters/orderBy to the live table. */
  applyViewState: (viewData: TableViewPresetState) => void;
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
  dateRange,
  activeViewId,
  onApplyView,
  applyViewState,
  onPreviewView,
}: CategoryPresetChipsProps) {
  const capture = usePostHogClientCapture();
  const resolvePercentileThreshold = useResolvePercentileThreshold(projectId);
  const [resolvingPresetId, setResolvingPresetId] = useState<string | null>(
    null,
  );
  const { TableViewPresetsList } = useViewData({
    tableName: TableViewPresetTableName.ObservationsEvents,
    projectId,
  });

  const presetsByCategory = useMemo(() => {
    const grouped = new Map<SystemTableViewPresetCategory, PresetItem[]>();
    for (const view of TableViewPresetsList ?? []) {
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
    // coming-soon placeholder for now.
    const errorsList = grouped.get(SystemTableViewPresetCategory.Errors) ?? [];
    grouped.set(SystemTableViewPresetCategory.Errors, [
      ...errorsList,
      LOW_QUALITY_COMING_SOON,
    ]);
    // Percentile presets need a time range to resolve their thresholds over.
    if (dateRange) {
      for (const { category, ...preset } of PERCENTILE_PRESETS) {
        grouped.set(category, [...(grouped.get(category) ?? []), preset]);
      }
    }
    return grouped;
  }, [TableViewPresetsList, dateRange]);

  const categories = SYSTEM_TABLE_VIEW_PRESET_CATEGORIES_ORDERED.filter(
    (category) => (presetsByCategory.get(category)?.length ?? 0) > 0,
  );

  if (categories.length === 0) return null;

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
              if (open)
                capture("saved_views:category_chip_open", {
                  category,
                  tableName: TableViewPresetTableName.ObservationsEvents,
                });
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("gap-1.5", isCategoryActive && "bg-primary/5")}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-1">
              <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
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
                      onFocus={() =>
                        preset.state && onPreviewView?.(preset.state)
                      }
                      onBlur={() => !preset.disabled && onPreviewView?.(null)}
                      onClick={() => {
                        if (preset.resolvePercentile && dateRange) {
                          // Resolve the percentile threshold over the current
                          // time range (snapshot), then apply it as a plain
                          // number filter — no ?viewId, the filter itself is
                          // the shareable state.
                          const spec = preset.resolvePercentile;
                          setResolvingPresetId(preset.id);
                          resolvePercentileThreshold({
                            measure: spec.measure,
                            percentile: spec.percentile,
                            from: dateRange.from,
                            to: dateRange.to ?? new Date(),
                          })
                            .then((raw) => {
                              if (raw === null) {
                                showErrorToast(
                                  "No data in range",
                                  `Could not compute ${spec.percentile} of ${spec.measure} for the selected time range.`,
                                  "WARNING",
                                );
                                return;
                              }
                              const threshold =
                                spec.toFilterValue?.(raw) ?? raw;
                              onApplyView(null);
                              applyViewState({
                                filters: [
                                  {
                                    column: spec.column,
                                    type: "number",
                                    operator: ">=",
                                    value: threshold,
                                  },
                                ],
                                orderBy: spec.orderBy ?? null,
                                columnOrder: [],
                                columnVisibility: {},
                                searchQuery: "",
                              });
                              capture("saved_views:category_chip_apply", {
                                category,
                                presetId: preset.id,
                                presetName: preset.name,
                                action: "apply",
                                percentile: spec.percentile,
                                tableName:
                                  TableViewPresetTableName.ObservationsEvents,
                              });
                            })
                            .catch(() => {
                              showErrorToast(
                                "Percentile unavailable",
                                "Failed to compute the percentile threshold. Please try again.",
                                "WARNING",
                              );
                            })
                            .finally(() => setResolvingPresetId(null));
                          return;
                        }
                        if (!preset.state) {
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
                        onApplyView(next);
                        applyViewState(
                          next ? preset.state : CLEARED_VIEW_STATE,
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
                        <span className="flex items-center gap-1.5 font-medium">
                          {preset.name}
                          {resolvingPresetId === preset.id && (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin"
                              aria-hidden
                            />
                          )}
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
                  // The disabled placeholder never applies, and percentile
                  // presets resolve asynchronously (the popover stays open so
                  // the inline spinner is visible) — neither is wrapped in
                  // PopoverClose. Plain presets close the popover on apply.
                  return preset.disabled || preset.resolvePercentile ? (
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
