import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  InfoIcon,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";
import { shouldReplaceDefaultOutputDefinitionField } from "@/src/features/evals/utils/template-form-defaults";
import {
  getGeneratedReasoningDescription,
  getGeneratedScoreDescription,
  PersistedEvalOutputDefinitionSchema,
  resolvePersistedEvalOutputDefinition,
  ScoreDataTypeEnum,
  type PersistedEvalOutputDefinition,
} from "@langfuse/shared";

export type ScoreOutputDataType =
  | typeof ScoreDataTypeEnum.NUMERIC
  | typeof ScoreDataTypeEnum.CATEGORICAL
  | typeof ScoreDataTypeEnum.BOOLEAN;

/** One categorical choice row: the label the judge picks and the numeric
    value it maps to. `value` stays a string while edited. */
export type ScoreOutputChoice = { label: string; value: string };

export type ScoreOutputFormState = {
  dataType: ScoreOutputDataType;
  /** Empty means "generate from the structured settings" — the generated
      text is shown as the field's placeholder. */
  scoreDescription: string;
  reasoningDescription: string;
  choices: ScoreOutputChoice[];
  minValue: string;
  maxValue: string;
};

const DATA_TYPE_OPTIONS: { value: ScoreOutputDataType; label: string }[] = [
  { value: ScoreDataTypeEnum.NUMERIC, label: "number" },
  { value: ScoreDataTypeEnum.CATEGORICAL, label: "category" },
  { value: ScoreDataTypeEnum.BOOLEAN, label: "boolean" },
];

// Two empty rows with autofilled values — the minimum a categorical score
// needs, ready for labels.
const DEFAULT_CHOICES: ScoreOutputChoice[] = [
  { label: "", value: "0" },
  { label: "", value: "1" },
];
const DEFAULT_MIN_VALUE = "0";
const DEFAULT_MAX_VALUE = "1";

/** "" → null, otherwise the parsed number ("abc" → NaN, callers reject). */
function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

/** Descriptions matching a known default collapse to "" so the form shows
    the generated text as a placeholder instead of stale prefilled copy. */
function normalizeDescription(
  value: string,
  field: "scoreDescription" | "reasoningDescription",
): string {
  return shouldReplaceDefaultOutputDefinitionField({
    currentValue: value,
    field,
  })
    ? ""
    : value;
}

/** Prefill from a persisted output definition (legacy → NUMERIC + descriptions). */
export function toScoreOutputFormState(
  outputDefinition: unknown,
): ScoreOutputFormState {
  const parsed =
    PersistedEvalOutputDefinitionSchema.safeParse(outputDefinition);
  if (!parsed.success) {
    return {
      dataType: ScoreDataTypeEnum.NUMERIC,
      scoreDescription: "",
      reasoningDescription: "",
      choices: [],
      minValue: DEFAULT_MIN_VALUE,
      maxValue: DEFAULT_MAX_VALUE,
    };
  }
  const resolved = resolvePersistedEvalOutputDefinition(parsed.data);
  return {
    dataType: resolved.dataType,
    scoreDescription: normalizeDescription(
      resolved.scoreDescription,
      "scoreDescription",
    ),
    reasoningDescription: normalizeDescription(
      resolved.reasoningDescription,
      "reasoningDescription",
    ),
    choices:
      "categories" in resolved
        ? resolved.categories.map((label) => ({
            label,
            value:
              resolved.categoryValues?.[label] != null
                ? String(resolved.categoryValues[label])
                : "",
          }))
        : [],
    minValue:
      "minValue" in resolved && resolved.minValue != null
        ? String(resolved.minValue)
        : "",
    maxValue:
      "maxValue" in resolved && resolved.maxValue != null
        ? String(resolved.maxValue)
        : "",
  };
}

/**
 * Build the persisted (v2 structured) output definition from form state.
 * Returns null when the state is invalid (too few choices, duplicate labels,
 * malformed numbers, min ≥ max) so callers can block save / test.
 */
export function buildScoreOutputDefinition(
  state: ScoreOutputFormState,
): PersistedEvalOutputDefinition | null {
  const base = {
    version: 2,
    dataType: state.dataType,
    reasoning: { description: state.reasoningDescription.trim() },
  };

  let candidate: unknown;
  if (state.dataType === ScoreDataTypeEnum.CATEGORICAL) {
    const choices = state.choices
      .map((choice) => ({ ...choice, label: choice.label.trim() }))
      .filter((choice) => choice.label.length > 0);
    const categoryValues: Record<string, number> = {};
    for (const choice of choices) {
      const value = parseOptionalNumber(choice.value);
      if (value === null) continue;
      if (Number.isNaN(value)) return null;
      categoryValues[choice.label] = value;
    }
    candidate = {
      ...base,
      score: {
        description: state.scoreDescription.trim(),
        categories: choices.map((choice) => choice.label),
        categoryValues:
          Object.keys(categoryValues).length > 0 ? categoryValues : null,
        shouldAllowMultipleMatches: false,
      },
    };
  } else if (state.dataType === ScoreDataTypeEnum.NUMERIC) {
    const minValue = parseOptionalNumber(state.minValue);
    const maxValue = parseOptionalNumber(state.maxValue);
    if (Number.isNaN(minValue) || Number.isNaN(maxValue)) return null;
    candidate = {
      ...base,
      score: {
        description: state.scoreDescription.trim(),
        minValue,
        maxValue,
      },
    };
  } else {
    candidate = {
      ...base,
      score: { description: state.scoreDescription.trim() },
    };
  }

  const parsed = PersistedEvalOutputDefinitionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** A section label with its helper copy tucked into a hover tooltip instead
    of a permanent paragraph — keeps the label row compact. */
function LabelWithTooltip({
  htmlFor,
  tooltip,
  children,
}: {
  htmlFor?: string;
  tooltip: ReactNode | null;
  children: ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
      {children}
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoIcon className="text-muted-foreground h-3.5 w-3.5 cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
        </Tooltip>
      ) : null}
    </Label>
  );
}

function CategoryEditorPopover({
  trigger,
  title,
  idSuffix,
  choice,
  onChange,
  onDelete,
  onDone,
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  title: string;
  idSuffix: string;
  choice: ScoreOutputChoice;
  onChange: (next: Partial<ScoreOutputChoice>) => void;
  onDelete?: () => void;
  onDone?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-bold">{title}</p>
            <p className="text-muted-foreground text-xs">
              Set the returned label and its optional numeric score.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`score-output-category-${idSuffix}`}>
              Category
            </Label>
            <Input
              id={`score-output-category-${idSuffix}`}
              placeholder="Category label"
              value={choice.label}
              onChange={(event) => onChange({ label: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`score-output-category-value-${idSuffix}`}>
              Numeric score
            </Label>
            <p className="text-muted-foreground text-xs">
              Used as this category&apos;s value in numeric analyses, such as
              averages and comparisons.
            </p>
            <Input
              id={`score-output-category-value-${idSuffix}`}
              type="number"
              placeholder="Optional"
              value={choice.value}
              onChange={(event) => onChange({ value: event.target.value })}
            />
          </div>
          <div
            className={cn(
              "flex items-center",
              onDelete ? "justify-between" : "justify-end",
            )}
          >
            {onDelete && (
              <PopoverClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  aria-label="Delete category"
                  title="Delete category"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </PopoverClose>
            )}
            <PopoverClose asChild>
              <Button type="button" size="sm" onClick={onDone}>
                Done
              </Button>
            </PopoverClose>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ScoreOutputSection({
  state,
  onChange,
  readOnly = false,
}: {
  state: ScoreOutputFormState;
  onChange: (next: ScoreOutputFormState) => void;
  readOnly?: boolean;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newChoice, setNewChoice] = useState<ScoreOutputChoice>({
    label: "",
    value: "0",
  });

  const handleDataTypeChange = (dataType: ScoreOutputDataType) => {
    onChange({
      ...state,
      dataType,
      // Custom descriptions survive the switch; defaults reset to
      // "generated" (empty) since they describe the previous type.
      scoreDescription: normalizeDescription(
        state.scoreDescription,
        "scoreDescription",
      ),
      reasoningDescription: normalizeDescription(
        state.reasoningDescription,
        "reasoningDescription",
      ),
      choices:
        dataType === ScoreDataTypeEnum.CATEGORICAL && state.choices.length === 0
          ? DEFAULT_CHOICES
          : state.choices,
      minValue:
        dataType === ScoreDataTypeEnum.NUMERIC &&
        state.minValue.trim() === "" &&
        state.maxValue.trim() === ""
          ? DEFAULT_MIN_VALUE
          : state.minValue,
      maxValue:
        dataType === ScoreDataTypeEnum.NUMERIC &&
        state.minValue.trim() === "" &&
        state.maxValue.trim() === ""
          ? DEFAULT_MAX_VALUE
          : state.maxValue,
    });
  };

  const updateChoice = (index: number, next: Partial<ScoreOutputChoice>) => {
    const choices = [...state.choices];
    choices[index] = { ...choices[index], ...next };
    onChange({ ...state, choices });
  };

  const nextChoiceValue = () => {
    const used = state.choices
      .map((choice) => Number(choice.value))
      .filter((value) => Number.isFinite(value));
    return String(used.length > 0 ? Math.max(...used) + 1 : 0);
  };

  const handleAddCategoryOpenChange = (open: boolean) => {
    if (open) setNewChoice({ label: "", value: nextChoiceValue() });
    setAddCategoryOpen(open);
  };

  const addChoice = () => {
    onChange({
      ...state,
      choices: [...state.choices, newChoice],
    });
  };

  const generatedScoreDescription = getGeneratedScoreDescription({
    dataType: state.dataType,
    minValue: parseOptionalNumber(state.minValue),
    maxValue: parseOptionalNumber(state.maxValue),
  });
  const generatedReasoningDescription = getGeneratedReasoningDescription({
    dataType: state.dataType,
  });
  const minimum = state.minValue.trim();
  const maximum = state.maxValue.trim();
  const numericBoundsLabel =
    minimum && maximum
      ? `between ${minimum} and ${maximum}`
      : minimum
        ? `of at least ${minimum}`
        : maximum
          ? `of at most ${maximum}`
          : "without limits";

  return (
    <div className="@container flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <LabelWithTooltip
          tooltip={
            readOnly
              ? null
              : "Choose the value the evaluator returns and how that value is constrained or mapped."
          }
        >
          Score output
        </LabelWithTooltip>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            {state.dataType === ScoreDataTypeEnum.CATEGORICAL
              ? "Return one"
              : "Return a"}
          </span>
          <Select
            value={state.dataType}
            disabled={readOnly}
            onValueChange={(value) =>
              handleDataTypeChange(value as ScoreOutputDataType)
            }
          >
            <SelectTrigger className="w-auto min-w-24" aria-label="Score type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATA_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {state.dataType === ScoreDataTypeEnum.NUMERIC && (
            <>
              {minimum || maximum ? <span>with values</span> : null}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 font-normal"
                    disabled={readOnly}
                  >
                    {numericBoundsLabel}
                    <ChevronDown className="text-muted-foreground ml-1 h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72">
                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="text-sm font-bold">Number limits</p>
                      <p className="text-muted-foreground text-sm">
                        Leave either field empty when only one side should be
                        constrained.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="score-output-minimum">Minimum</Label>
                        <Input
                          id="score-output-minimum"
                          type="number"
                          placeholder="No minimum"
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
                        <Label htmlFor="score-output-maximum">Maximum</Label>
                        <Input
                          id="score-output-maximum"
                          type="number"
                          placeholder="No maximum"
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
              <span>from</span>
              {state.choices.map((choice, index) => (
                <CategoryEditorPopover
                  key={index}
                  title="Edit category"
                  idSuffix={String(index)}
                  choice={choice}
                  onChange={(next) => updateChoice(index, next)}
                  onDelete={() =>
                    onChange({
                      ...state,
                      choices: state.choices.filter((_, i) => i !== index),
                    })
                  }
                  trigger={
                    <button
                      type="button"
                      className="bg-background hover:bg-muted/80 focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-md border px-2 font-bold focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-default disabled:opacity-70"
                      disabled={readOnly}
                    >
                      <span>
                        {choice.label.trim() || `Category ${index + 1}`}
                      </span>
                      <ChevronRight className="text-muted-foreground h-4 w-4" />
                    </button>
                  }
                />
              ))}
              {!readOnly ? (
                <CategoryEditorPopover
                  title="Add category"
                  idSuffix="new"
                  choice={newChoice}
                  onChange={(next) =>
                    setNewChoice((current) => ({ ...current, ...next }))
                  }
                  onDone={addChoice}
                  open={addCategoryOpen}
                  onOpenChange={handleAddCategoryOpenChange}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="bg-background hover:bg-muted/80 h-8 w-8"
                      aria-label="Add category"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  }
                />
              ) : null}
            </>
          )}

          {state.dataType === ScoreDataTypeEnum.BOOLEAN && (
            <>
              <span>as</span>
              <span className="bg-background inline-flex h-8 items-center gap-1.5 rounded-md border px-2 font-bold">
                true
              </span>
              <span>or</span>
              <span className="bg-background inline-flex h-8 items-center gap-1.5 rounded-md border px-2 font-bold">
                false
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <button
          type="button"
          className="flex w-fit items-center gap-1.5 text-sm font-bold"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((prev) => !prev)}
        >
          <ChevronDown
            className={cn(
              "text-muted-foreground h-4 w-4 transition-transform",
              !advancedOpen && "-rotate-90",
            )}
          />
          Advanced
        </button>

        {advancedOpen && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <LabelWithTooltip
                tooltip={
                  readOnly
                    ? null
                    : "How the score field is described to the judge. Leave empty to use the text generated from the settings above."
                }
              >
                Score description
              </LabelWithTooltip>
              <Textarea
                className="min-h-16"
                placeholder={generatedScoreDescription}
                value={state.scoreDescription}
                disabled={readOnly}
                onChange={(e) =>
                  onChange({ ...state, scoreDescription: e.target.value })
                }
              />
            </div>

            <div className="flex flex-col gap-2">
              <LabelWithTooltip
                tooltip={
                  readOnly
                    ? null
                    : "Tells the judge what its written reasoning should cover."
                }
              >
                Reasoning description
              </LabelWithTooltip>
              <Textarea
                className="min-h-16"
                placeholder={generatedReasoningDescription}
                value={state.reasoningDescription}
                disabled={readOnly}
                onChange={(e) =>
                  onChange({ ...state, reasoningDescription: e.target.value })
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
