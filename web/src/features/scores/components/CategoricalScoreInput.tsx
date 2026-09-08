import { useState } from "react";
import { Plus } from "lucide-react";
import {
  type ScoreConfigCategoryDomain,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Combobox } from "@/src/components/ui/combobox";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { useHasProjectAccess } from "@/src/features/rbac";
import { isCategoricalDataType } from "@/src/features/scores/lib/helpers";
import { getAddCategoryActionLabel } from "@/src/features/scores/lib/annotationFormHelpers";
import { AddScoreCategoryDialog } from "@/src/features/scores/components/AddScoreCategoryDialog";
import { type AnalyticsData } from "@/src/features/scores/types";

const CHAR_CUTOFF = 6;
const DIGIT_SHORTCUTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function shouldUseCombobox(
  categories: Pick<ScoreConfigCategoryDomain, "label">[],
) {
  const hasMoreThanThreeCategories = categories.length > 3;
  const hasLongCategoryNames = categories.some(
    ({ label }) => label.length > CHAR_CUTOFF,
  );

  return (
    hasMoreThanThreeCategories ||
    (categories.length > 1 && hasLongCategoryNames)
  );
}

export function CategoricalScoreInput({
  projectId,
  config,
  categories,
  value,
  disabled,
  name,
  source,
  onValueChange,
}: {
  projectId: string;
  config: ScoreConfigDomain;
  categories: (ScoreConfigCategoryDomain & { isOutdated: boolean })[];
  value: string;
  disabled: boolean;
  name: string;
  source: AnalyticsData["source"] | undefined;
  onValueChange: (value: string, numericValue?: number) => void;
}) {
  const hasConfigCudAccess = useHasProjectAccess({
    projectId,
    scope: "scoreConfigs:CUD",
  });
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const canAddCategory =
    hasConfigCudAccess &&
    isCategoricalDataType(config.dataType) &&
    !config.isArchived &&
    !disabled;
  const existingLabels = categories
    .filter((category) => !category.isOutdated)
    .map((category) => category.label);

  const addCategoryButton = (search: string, close?: () => void) => (
    <button
      type="button"
      className="hover:bg-accent hover:text-accent-foreground flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs"
      onClick={() => {
        close?.();
        setPendingLabel(search.trim());
      }}
    >
      <Plus className="mr-2 h-3.5 w-3.5 shrink-0" />
      {getAddCategoryActionLabel(search, existingLabels)}
    </button>
  );

  return (
    <>
      {shouldUseCombobox(categories) ? (
        <Combobox
          name={name}
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
          options={categories.map((category) => ({
            value: category.label,
            disabled: category.isOutdated,
          }))}
          placeholder="Select category"
          searchPlaceholder="Search categories..."
          emptyText="No category found."
          footer={
            canAddCategory
              ? ({ search, close }) => addCategoryButton(search, close)
              : undefined
          }
        />
      ) : (
        <div className="flex items-center gap-1">
          <ToggleGroup
            type="single"
            // Horizontal roving so Radix only uses
            // ←/→ between True/False, leaving ↑/↓ for
            // our field navigation (no double-handling).
            orientation="horizontal"
            value={value}
            disabled={disabled}
            className={`grid flex-1 grid-cols-${categories.length}`}
            onValueChange={onValueChange}
          >
            {categories.map((category) =>
              category.isOutdated ? (
                <ToggleGroupItem
                  key={category.value}
                  value={category.label}
                  disabled
                  variant="outline"
                  className="grid grid-flow-col gap-1 px-1 text-xs font-normal text-nowrap opacity-50"
                >
                  <span className="truncate" title={category.label}>
                    {category.label}
                  </span>
                  <span>{`(${category.value})`}</span>
                </ToggleGroupItem>
              ) : (
                <ToggleGroupItem
                  key={category.value}
                  value={category.label}
                  variant="outline"
                  className="grid grid-flow-col gap-1 px-1 text-xs font-normal text-nowrap"
                >
                  <span className="truncate" title={category.label}>
                    {category.label}
                  </span>
                  {(() => {
                    const categoryIndex =
                      config.categories?.findIndex(
                        (c) => c.label === category.label,
                      ) ?? -1;
                    const digitShortcut = DIGIT_SHORTCUTS[categoryIndex];
                    return digitShortcut ? (
                      <span className="ml-0.5 hidden md:group-focus-within:inline-flex">
                        <KeyboardShortcut size="xs" keys={[digitShortcut]} />
                      </span>
                    ) : null;
                  })()}
                </ToggleGroupItem>
              ),
            )}
          </ToggleGroup>
          {canAddCategory ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title="Add new category"
              onClick={() => setPendingLabel("")}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      )}
      {pendingLabel !== null ? (
        <AddScoreCategoryDialog
          projectId={projectId}
          config={config}
          initialLabel={pendingLabel}
          source={source}
          onClose={() => setPendingLabel(null)}
          onCategoryAdded={onValueChange}
        />
      ) : null}
    </>
  );
}
