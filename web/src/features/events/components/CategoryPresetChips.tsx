import { useMemo } from "react";
import {
  AlertTriangle,
  Check,
  DollarSign,
  ThumbsDown,
  Timer,
  type LucideIcon,
} from "lucide-react";
import {
  SYSTEM_TABLE_VIEW_PRESET_CATEGORIES_ORDERED,
  SYSTEM_TABLE_VIEW_PRESET_CATEGORY_META,
  SystemTableViewPresetCategory,
  TableViewPresetTableName,
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
  [SystemTableViewPresetCategory.Errors]: AlertTriangle,
  [SystemTableViewPresetCategory.CostRegression]: DollarSign,
  [SystemTableViewPresetCategory.LowQuality]: ThumbsDown,
};

type PresetItem = {
  id: string;
  name: string;
  description?: string;
  // Mock presets are rendered but not yet wired to a real filter.
  disabled?: boolean;
};

// Placeholder "Low quality" presets. These are visual mocks only for now —
// wiring them to real, project-specific score filters is a follow-up, because
// score names and thresholds vary per project (see the plan's Phase 5).
const LOW_QUALITY_MOCK_PRESETS: PresetItem[] = [
  {
    id: "__mock_low_eval_scores",
    name: "Low eval scores",
    description: "Observations with below-average evaluation scores",
    disabled: true,
  },
  {
    id: "__mock_failed_evaluations",
    name: "Failed evaluations",
    description: "Observations flagged by an evaluator",
    disabled: true,
  },
  {
    id: "__mock_negative_feedback",
    name: "Negative user feedback",
    description: "Observations with thumbs-down user feedback",
    disabled: true,
  },
];

type CategoryPresetChipsProps = {
  projectId: string;
  /** The currently applied view id, used to render the active chip/row state. */
  activeViewId: string | null;
  /** Apply a preset by id, or pass null to clear the current view. */
  onApplyView: (viewId: string | null) => void;
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
}: CategoryPresetChipsProps) {
  const capture = usePostHogClientCapture();
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
      });
      grouped.set(view.category, list);
    }
    // Low quality is mocked client-side until real score-based presets land.
    grouped.set(
      SystemTableViewPresetCategory.LowQuality,
      LOW_QUALITY_MOCK_PRESETS,
    );
    return grouped;
  }, [TableViewPresetsList]);

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
          (preset) => !preset.disabled && preset.id === activeViewId,
        );

        return (
          <Popover key={category}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "gap-1.5 rounded-full",
                  isCategoryActive && "border-primary-accent bg-primary/5",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {label}
              </div>
              {presets.map((preset) => {
                const isPresetActive =
                  !preset.disabled && preset.id === activeViewId;
                const row = (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={preset.disabled}
                    onClick={() => {
                      if (preset.disabled) return;
                      const next = isPresetActive ? null : preset.id;
                      onApplyView(next);
                      capture("saved_views:category_chip_apply", {
                        category,
                        presetId: next,
                      });
                    }}
                    className={cn(
                      "flex w-full items-start justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                      preset.disabled
                        ? "cursor-not-allowed opacity-60"
                        : "hover:bg-accent",
                    )}
                  >
                    <span className="flex flex-col">
                      <span className="flex items-center gap-1.5 font-medium">
                        {preset.name}
                        {preset.disabled && (
                          <span className="rounded-sm border px-1 text-[10px] font-normal uppercase text-muted-foreground">
                            Soon
                          </span>
                        )}
                      </span>
                      {preset.description && (
                        <span className="text-xs text-muted-foreground">
                          {preset.description}
                        </span>
                      )}
                    </span>
                    {isPresetActive && (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-accent" />
                    )}
                  </button>
                );

                // Applying/toggling a real preset closes the popover; disabled
                // mocks stay put (the button no-ops).
                return preset.disabled ? (
                  row
                ) : (
                  <PopoverClose asChild key={preset.id}>
                    {row}
                  </PopoverClose>
                );
              })}
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}
