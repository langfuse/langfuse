import { type FilterState } from "@langfuse/shared";

const SYSTEM_PRESET_ID_PREFIX = "__langfuse_";

export interface SessionDetailSystemPreset {
  id: string;
  name: string;
  description?: string;
  filters: FilterState;
}

export const SESSION_DETAIL_SYSTEM_PRESETS: SessionDetailSystemPreset[] = [
  {
    id: `${SYSTEM_PRESET_ID_PREFIX}first_generation__`,
    name: "First Generation in Trace",
    description: "Shows only the first generation in each trace",
    filters: [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
      {
        column: "positionInTrace",
        type: "positionInTrace",
        operator: "=",
        key: "first",
      },
    ] satisfies FilterState,
  },
  {
    id: `${SYSTEM_PRESET_ID_PREFIX}last_generation__`,
    name: "Last Generation in Trace",
    description: "Shows only the last generation in each trace",
    filters: [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
      {
        column: "positionInTrace",
        type: "positionInTrace",
        operator: "=",
        key: "last",
      },
    ] satisfies FilterState,
  },
];

export const getSessionDetailDefaultPreset = () =>
  SESSION_DETAIL_SYSTEM_PRESETS[0];

export const getSessionDetailPresetToApply = ({
  selectedViewId,
  hasFilters,
}: {
  selectedViewId: string | null;
  hasFilters: boolean;
}): SessionDetailSystemPreset | null => {
  const selectedSystemPreset = SESSION_DETAIL_SYSTEM_PRESETS.find(
    (preset) => preset.id === selectedViewId,
  );

  if (selectedViewId && !selectedSystemPreset) {
    return null;
  }

  if (hasFilters) {
    return null;
  }

  return selectedSystemPreset ?? getSessionDetailDefaultPreset();
};
