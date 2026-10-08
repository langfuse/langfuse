import { useState } from "react";
import { Plus } from "lucide-react";
import {
  type ScoreConfigCategoryDomain,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Combobox } from "@/src/components/ui/combobox";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { useHasProjectAccess } from "@/src/features/rbac";
import { isCategoricalDataType } from "@/src/features/scores/lib/helpers";
import { getAddCategoryActionLabel } from "@/src/features/scores/lib/annotationFormHelpers";
import { AddScoreCategoryDialog } from "@/src/features/scores/components/AddScoreCategoryDialog";
import { type AnnotationAnalyticsContext } from "@/src/features/scores/lib/annotationAnalytics";

const CHAR_CUTOFF = 6;
const DIGIT_SHORTCUTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function shouldUseCombobox(
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
  analyticsData,
  onValueChange,
  isActive = true,
}: {
  projectId: string;
  config: ScoreConfigDomain;
  categories: (ScoreConfigCategoryDomain & { isOutdated: boolean })[];
  value: string;
  disabled: boolean;
  name: string;
  analyticsData: AnnotationAnalyticsContext;
  onValueChange: (value: string, numericValue?: number) => void;
  isActive?: boolean;
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
      <Plus className="icon-base mr-2 shrink-0" />
      {getAddCategoryActionLabel(search, existingLabels)}
    </button>
  );

  return (
    <>
      {shouldUseCombobox(categories) ? (
        <Combobox
          name={name}
          value={value}
          disabled={disabled || !isActive}
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
          <div className="min-w-0 flex-1">
            {/* Manual activation: ←/→ only move focus, Enter/Space picks. ↑/↓ stay with the form's row navigation. */}
            <Tabs
              value={value}
              onValueChange={onValueChange}
              activationMode="manual"
            >
              <Tabs.List
                variant="inset"
                size="md"
                layout="full"
                aria-label={config.name}
              >
                {categories.map((category) => {
                  const categoryIndex =
                    config.categories?.findIndex(
                      (c) => c.label === category.label,
                    ) ?? -1;
                  const digitShortcut = category.isOutdated
                    ? undefined
                    : DIGIT_SHORTCUTS[categoryIndex];
                  return (
                    <Tabs.Trigger
                      key={category.value}
                      value={category.label}
                      disabled={disabled || category.isOutdated}
                    >
                      <span className="min-w-0 truncate" title={category.label}>
                        {category.label}
                      </span>
                      {category.isOutdated ? (
                        <span>{`(${category.value})`}</span>
                      ) : null}
                      {digitShortcut ? (
                        <span className="hidden md:group-focus-within:inline-flex">
                          <KeyboardShortcut size="xs" keys={[digitShortcut]} />
                        </span>
                      ) : null}
                    </Tabs.Trigger>
                  );
                })}
              </Tabs.List>
            </Tabs>
          </div>
          {canAddCategory ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title="Add new category"
              onClick={() => setPendingLabel("")}
            >
              <Plus className="icon-sm text-icon-foreground" />
            </Button>
          ) : null}
        </div>
      )}
      {pendingLabel !== null ? (
        <AddScoreCategoryDialog
          isActive={isActive}
          projectId={projectId}
          config={config}
          initialLabel={pendingLabel}
          analyticsData={analyticsData}
          onClose={() => setPendingLabel(null)}
          onCategoryAdded={onValueChange}
        />
      ) : null}
    </>
  );
}
