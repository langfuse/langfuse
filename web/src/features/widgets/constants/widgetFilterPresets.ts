import { type views } from "@/src/features/query/types";
import { type z } from "zod";
import { BeakerIcon, type LucideIcon } from "lucide-react";
import { type FilterState } from "@langfuse/shared";

/**
 * Widget filter preset definition.
 */
type WidgetFilterPreset = {
  label: string;
  description: string;
  icon: LucideIcon;
  /** The view this preset applies to */
  view: z.infer<typeof views>;
  /** Filters to apply - must be complete, valid filters */
  filters: FilterState;
};

/**
 * Predefined filter presets for common widget configurations.
 *
 * To add a new preset:
 * 1. Add a new key to this object
 * 2. TypeScript will validate that filters match FilterState schema
 * 3. If a filter column is renamed/removed, TypeScript won't catch it directly,
 *    but the filter will fail at runtime when applied
 */
export const WIDGET_FILTER_PRESETS = {
  allExperimentData: {
    label: "Experiment Data",
    description: "All experiment-items linked to experiments",
    icon: BeakerIcon,
    view: "observations",
    filters: [
      {
        column: "experimentId",
        type: "null",
        operator: "is not null",
        value: "",
      },
    ],
  },
} as const satisfies Record<string, WidgetFilterPreset>;

export type WidgetFilterPresetKey = keyof typeof WIDGET_FILTER_PRESETS;
