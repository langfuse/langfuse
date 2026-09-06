import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Plus, TriangleAlert } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { cn } from "@/src/utils/tailwind";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  selectTriggerClassName,
} from "@/src/components/ui/select";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { ScoreDataTypeEnum } from "@langfuse/shared";
import { CategoryEditorPopover } from "./components/CategoryEditorPopover/CategoryEditorPopover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { getScoreOutputValidation } from "@/src/features/evals/v2/fns/scoreOutput/getScoreOutputValidation";

import {
  type ScoreOutputChoice,
  type ScoreOutputDataType,
  type ScoreOutputSelectorState,
} from "@/src/features/evals/v2/scoreOutputTypes";
import { useTranslations } from "next-intl";

const DATA_TYPE_OPTIONS: ScoreOutputDataType[] = [
  ScoreDataTypeEnum.NUMERIC,
  ScoreDataTypeEnum.CATEGORICAL,
  ScoreDataTypeEnum.BOOLEAN,
];

// Two empty rows — the minimum a categorical score needs, ready for labels.
const DEFAULT_CHOICES: ScoreOutputChoice[] = [{ label: "" }, { label: "" }];
const DEFAULT_MIN_VALUE = "0";
const DEFAULT_MAX_VALUE = "1";

/** A section label with its helper copy tucked into a hover tooltip instead
    of a permanent paragraph — keeps the label row compact. */
function LabelWithTooltip({
  htmlFor,
  label,
  tooltip,
  children,
}: {
  htmlFor?: string;
  label: string;
  tooltip: ReactNode | null;
  children: ReactNode;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
      {children}
      {tooltip ? (
        <InfoTooltip label={t("aboutSection", { title: label })}>
          {tooltip}
        </InfoTooltip>
      ) : null}
    </Label>
  );
}

export function ScoreOutputSection({
  state,
  onChange,
  readOnly = false,
}: {
  state: ScoreOutputSelectorState;
  onChange: (next: ScoreOutputSelectorState) => void;
  readOnly?: boolean;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const boundsId = useId();
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [editingChoiceIndex, setEditingChoiceIndex] = useState<number | null>(
    null,
  );
  const [newChoice, setNewChoice] = useState<ScoreOutputChoice>({ label: "" });
  const localizedValidation = getScoreOutputValidation(state, {
    emptyCategoryName: t("scoreOutput.validation.emptyCategoryName"),
    duplicateCategoryNames: t("scoreOutput.validation.duplicateCategoryNames"),
    minimumCategories: t("scoreOutput.validation.minimumCategories"),
  });

  const handleDataTypeChange = (dataType: ScoreOutputDataType) => {
    onChange({
      ...state,
      dataType,
      shouldAllowMultipleMatches:
        dataType === ScoreDataTypeEnum.CATEGORICAL
          ? state.shouldAllowMultipleMatches
          : false,
      choices:
        dataType === ScoreDataTypeEnum.CATEGORICAL && state.choices.length === 0
          ? DEFAULT_CHOICES
          : state.choices,
      minValue:
        dataType === ScoreDataTypeEnum.NUMERIC && !state.minValue.trim()
          ? DEFAULT_MIN_VALUE
          : state.minValue,
      maxValue:
        dataType === ScoreDataTypeEnum.NUMERIC && !state.maxValue.trim()
          ? DEFAULT_MAX_VALUE
          : state.maxValue,
    });
  };

  const updateChoice = (index: number, next: Partial<ScoreOutputChoice>) => {
    const choices = [...state.choices];
    choices[index] = { ...choices[index], ...next };
    onChange({ ...state, choices });
  };

  const handleAddCategoryOpenChange = (open: boolean) => {
    if (open) setNewChoice({ label: "" });
    setAddCategoryOpen(open);
  };

  const addChoice = () => {
    onChange({
      ...state,
      choices: [...state.choices, newChoice],
    });
  };

  const minimum = state.minValue.trim();
  const maximum = state.maxValue.trim();
  const numericBoundsLabel =
    minimum && maximum
      ? t("scoreOutput.bounds.between", { minimum, maximum })
      : minimum
        ? t("scoreOutput.bounds.atLeast", { minimum })
        : maximum
          ? t("scoreOutput.bounds.atMost", { maximum })
          : t("scoreOutput.bounds.withoutLimits");

  return (
    <div className="flex flex-col gap-2">
      <LabelWithTooltip
        label={t("scoreOutput.labelLowercase")}
        tooltip={readOnly ? null : t("scoreOutput.tooltip")}
      >
        {t("scoreOutput.label")}
      </LabelWithTooltip>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{t("scoreOutput.return")}</span>
        {state.dataType === ScoreDataTypeEnum.CATEGORICAL ? (
          <Select
            value={state.shouldAllowMultipleMatches ? "multiple" : "one"}
            disabled={readOnly}
            onValueChange={(value) =>
              onChange({
                ...state,
                shouldAllowMultipleMatches: value === "multiple",
              })
            }
          >
            <SelectTrigger
              className="w-auto min-w-24"
              aria-label={t("scoreOutput.numberOfCategories")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one">{t("scoreOutput.one")}</SelectItem>
              <SelectItem value="multiple">
                {t("scoreOutput.multiple")}
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span>{t("scoreOutput.a")}</span>
        )}
        <Select
          value={state.dataType}
          disabled={readOnly}
          onValueChange={(value) =>
            handleDataTypeChange(value as ScoreOutputDataType)
          }
        >
          <SelectTrigger
            className="w-auto min-w-24"
            aria-label={t("scoreOutput.scoreType")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATA_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === ScoreDataTypeEnum.CATEGORICAL &&
                state.shouldAllowMultipleMatches
                  ? t("scoreOutput.types.categories")
                  : option === ScoreDataTypeEnum.NUMERIC
                    ? t("scoreOutput.types.number")
                    : option === ScoreDataTypeEnum.CATEGORICAL
                      ? t("scoreOutput.types.category")
                      : t("scoreOutput.types.boolean")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {state.dataType === ScoreDataTypeEnum.NUMERIC && (
          <>
            {minimum || maximum ? (
              <span>{t("scoreOutput.withValues")}</span>
            ) : null}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(selectTriggerClassName, "w-auto")}
                  disabled={readOnly}
                >
                  {numericBoundsLabel}
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72">
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-sm font-bold">
                      {t("scoreOutput.bounds.title")}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {t("scoreOutput.bounds.description")}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${boundsId}-minimum`}>
                        {t("scoreOutput.bounds.minimum")}
                      </Label>
                      <Input
                        id={`${boundsId}-minimum`}
                        type="number"
                        value={state.minValue}
                        onChange={(e) =>
                          onChange({
                            ...state,
                            minValue: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${boundsId}-maximum`}>
                        {t("scoreOutput.bounds.maximum")}
                      </Label>
                      <Input
                        id={`${boundsId}-maximum`}
                        type="number"
                        value={state.maxValue}
                        onChange={(e) =>
                          onChange({
                            ...state,
                            maxValue: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}

        {state.dataType === ScoreDataTypeEnum.CATEGORICAL && (
          <>
            <span>{t("scoreOutput.from")}</span>
            {state.choices.map((choice, index) => {
              const categoryWarning =
                localizedValidation.categoryWarnings[index];

              return (
                <CategoryEditorPopover
                  key={index}
                  title={t("scoreOutput.category.edit")}
                  idSuffix={String(index)}
                  choice={choice}
                  open={editingChoiceIndex === index}
                  onOpenChange={(open) =>
                    setEditingChoiceIndex(open ? index : null)
                  }
                  onChange={(next) => updateChoice(index, next)}
                  onDelete={() => {
                    onChange({
                      ...state,
                      choices: state.choices.filter((_, i) => i !== index),
                    });
                    setEditingChoiceIndex(null);
                  }}
                  onDone={() => setEditingChoiceIndex(null)}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(selectTriggerClassName, "w-auto")}
                      disabled={readOnly}
                    >
                      <span>
                        {choice.label.trim() ||
                          t("scoreOutput.category.defaultName", {
                            number: index + 1,
                          })}
                      </span>
                      {categoryWarning ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="text-dark-yellow h-4 w-4 shrink-0"
                              aria-label={t("warningWithMessage", {
                                message: categoryWarning,
                              })}
                            >
                              <TriangleAlert
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{categoryWarning}</TooltipContent>
                        </Tooltip>
                      ) : null}
                      {!readOnly ? (
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                      ) : null}
                    </Button>
                  </PopoverTrigger>
                </CategoryEditorPopover>
              );
            })}
            {!readOnly ? (
              <CategoryEditorPopover
                title={t("scoreOutput.category.add")}
                idSuffix="new"
                choice={newChoice}
                onChange={(next) =>
                  setNewChoice((current) => ({ ...current, ...next }))
                }
                onDelete={null}
                onDone={() => {
                  addChoice();
                  setAddCategoryOpen(false);
                }}
                open={addCategoryOpen}
                onOpenChange={handleAddCategoryOpenChange}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("scoreOutput.category.add")}
                    title={t("scoreOutput.category.add")}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
              </CategoryEditorPopover>
            ) : null}
          </>
        )}

        {state.dataType === ScoreDataTypeEnum.BOOLEAN && (
          <>
            <span>{t("scoreOutput.as")}</span>
            <span className="bg-background inline-flex h-8 items-center rounded-md border px-2 font-bold">
              true
            </span>
            <span>{t("scoreOutput.or")}</span>
            <span className="bg-background inline-flex h-8 items-center rounded-md border px-2 font-bold">
              false
            </span>
          </>
        )}
      </div>
    </div>
  );
}
