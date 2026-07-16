import { useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
// Animated tab variants: the active pill slides between options.
import {
  Tabs,
  AnimatedTabsList as TabsList,
  AnimatedTabsTrigger as TabsTrigger,
} from "@/src/components/ui/tabs";
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
  { value: ScoreDataTypeEnum.NUMERIC, label: "Numeric" },
  { value: ScoreDataTypeEnum.CATEGORICAL, label: "Categorical" },
  { value: ScoreDataTypeEnum.BOOLEAN, label: "Boolean" },
];

// Two empty rows with autofilled values — the minimum a categorical score
// needs, ready for labels.
const DEFAULT_CHOICES: ScoreOutputChoice[] = [
  { label: "", value: "0" },
  { label: "", value: "1" },
];

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
      minValue: "",
      maxValue: "",
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

export function ScoreOutputSection({
  state,
  onChange,
  scoreName,
  onScoreNameChange,
  defaultScoreName,
}: {
  state: ScoreOutputFormState;
  onChange: (next: ScoreOutputFormState) => void;
  /** Optional score-name override — empty inherits the evaluator name. */
  scoreName: string;
  onScoreNameChange: (next: string) => void;
  /** The inherited default (evaluator name), shown as the placeholder. */
  defaultScoreName: string;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
    });
  };

  const updateChoice = (index: number, next: Partial<ScoreOutputChoice>) => {
    const choices = [...state.choices];
    choices[index] = { ...choices[index], ...next };
    onChange({ ...state, choices });
  };

  // New rows continue the numeric sequence (0, 1, 2, …) past the largest
  // value already used, so autofill never collides with user overrides.
  const addChoice = () => {
    const used = state.choices
      .map((choice) => Number(choice.value))
      .filter((value) => Number.isFinite(value));
    const nextValue = used.length > 0 ? Math.max(...used) + 1 : 0;
    onChange({
      ...state,
      choices: [...state.choices, { label: "", value: String(nextValue) }],
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Score type</Label>
        <p className="text-muted-foreground text-sm">
          Choose whether the evaluator should return a numeric score, one of a
          fixed set of categories, or a boolean verdict.
        </p>
        <Tabs
          value={state.dataType}
          onValueChange={(value) =>
            handleDataTypeChange(value as ScoreOutputDataType)
          }
        >
          <TabsList>
            {DATA_TYPE_OPTIONS.map((option) => (
              <TabsTrigger key={option.value} value={option.value}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {state.dataType === ScoreDataTypeEnum.NUMERIC && (
        <div className="flex flex-col gap-2">
          <Label>Range (optional)</Label>
          <p className="text-muted-foreground text-sm">
            Constrains the judge to this range. Leave empty for an unbounded
            score.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              className="w-32"
              placeholder="Min, e.g. 0"
              aria-label="Minimum score"
              value={state.minValue}
              onChange={(e) => onChange({ ...state, minValue: e.target.value })}
            />
            <span className="text-muted-foreground text-sm">to</span>
            <Input
              type="number"
              className="w-32"
              placeholder="Max, e.g. 1"
              aria-label="Maximum score"
              value={state.maxValue}
              onChange={(e) => onChange({ ...state, maxValue: e.target.value })}
            />
          </div>
        </div>
      )}

      {state.dataType === ScoreDataTypeEnum.CATEGORICAL && (
        <div className="flex flex-col gap-2">
          <Label>Choices (at least 2)</Label>
          <p className="text-muted-foreground text-sm">
            The labels the judge picks from, each with the numeric value it maps
            to.
          </p>
          {state.choices.map((choice, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                className="flex-1"
                placeholder={`Choice ${index + 1}`}
                aria-label={`Choice ${index + 1} label`}
                value={choice.label}
                onChange={(e) => updateChoice(index, { label: e.target.value })}
              />
              <Input
                type="number"
                className="w-24"
                placeholder="Value"
                aria-label={`Choice ${index + 1} value`}
                value={choice.value}
                onChange={(e) => updateChoice(index, { value: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove choice"
                onClick={() =>
                  onChange({
                    ...state,
                    choices: state.choices.filter((_, i) => i !== index),
                  })
                }
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={addChoice}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add choice
          </Button>
        </div>
      )}

      {state.dataType === ScoreDataTypeEnum.BOOLEAN && (
        <div className="flex flex-col gap-2">
          <Label>Values</Label>
          <p className="text-muted-foreground text-sm">
            Boolean verdicts are fixed — stored as 1 (true) or 0 (false).
          </p>
          {[
            { label: "true", value: "1" },
            { label: "false", value: "0" },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-2">
              <Input className="flex-1" value={row.label} disabled readOnly />
              <Input className="w-24" value={row.value} disabled readOnly />
              {/* Spacer matching the choices' remove button keeps columns aligned
                  when switching between categorical and boolean. */}
              <div className="w-10" aria-hidden />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <button
          type="button"
          className="flex w-fit items-center gap-1.5 text-sm font-medium"
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
              <Label htmlFor="score-output-name">Score name</Label>
              <p className="text-muted-foreground text-sm">
                Scores are written under this name. Leave empty to use the
                evaluator name.
              </p>
              <Input
                id="score-output-name"
                className="max-w-md"
                placeholder={defaultScoreName || "e.g. hallucination"}
                value={scoreName}
                onChange={(e) => onScoreNameChange(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Score description</Label>
              <p className="text-muted-foreground text-sm">
                How the score field is described to the judge. Leave empty to
                use the text generated from the settings above.
              </p>
              <Textarea
                className="min-h-16"
                placeholder={generatedScoreDescription}
                value={state.scoreDescription}
                onChange={(e) =>
                  onChange({ ...state, scoreDescription: e.target.value })
                }
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Reasoning description</Label>
              <p className="text-muted-foreground text-sm">
                Tells the judge what its written reasoning should cover.
              </p>
              <Textarea
                className="min-h-16"
                placeholder={generatedReasoningDescription}
                value={state.reasoningDescription}
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
