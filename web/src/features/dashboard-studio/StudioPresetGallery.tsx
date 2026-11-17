import { useState } from "react";
import {
  HOME_DASHBOARD_PRESET_IDS,
  getStudioPresetReplacement,
  type DashboardDefinition,
  type HomeDashboardPresetId,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import { ArrowRightIcon, PlusIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";

type LegacyPlacement = Extract<
  DashboardDefinition["widgets"][number],
  { type: "preset" }
>;

export function StudioPresetGallery({
  legacyPlacements,
  onAdd,
  onCompare,
}: {
  legacyPlacements: LegacyPlacement[];
  onAdd: (
    presetId: HomeDashboardPresetId,
    configs: StudioWidgetConfig[],
  ) => void;
  onCompare: (placement: LegacyPlacement) => void;
}) {
  const [selected, setSelected] =
    useState<HomeDashboardPresetId>("home-model-costs");
  return (
    <details className="bg-background rounded-lg border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-bold">
        Start from a familiar card
      </summary>
      <div className="flex flex-col gap-4 border-t p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label className="text-muted-foreground mb-2 block text-xs">
              Every preset creates a fully editable widget
            </label>
            <SelectInput
              aria-label="Widget preset"
              value={selected}
              placeholder="Choose a preset"
              options={HOME_DASHBOARD_PRESET_IDS.map((value) => ({
                value,
                label: getStudioPresetReplacement(value)[0]?.title ?? value,
              }))}
              onValueChange={setSelected}
            />
          </div>
          <Button
            text="Add editable preset"
            icon={PlusIcon}
            variant="outline"
            onClick={() =>
              onAdd(selected, getStudioPresetReplacement(selected))
            }
          />
        </div>
        {legacyPlacements.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">
              Compare a frozen card already on this dashboard with its
              configurable replacement.
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {legacyPlacements.map((placement) => (
                <button
                  key={placement.id}
                  type="button"
                  onClick={() => onCompare(placement)}
                  className="hover:bg-muted flex items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm"
                >
                  <span>
                    {
                      getStudioPresetReplacement(
                        placement.presetId as HomeDashboardPresetId,
                      )[0]?.title
                    }
                  </span>
                  <ArrowRightIcon size="base" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
