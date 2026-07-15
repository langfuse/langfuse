import { useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";

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
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";
import {
  getDefaultOutputDefinitionFormValues,
  shouldReplaceDefaultOutputDefinitionField,
} from "@/src/features/evals/utils/template-form-defaults";
import {
  PersistedEvalOutputDefinitionSchema,
  resolvePersistedEvalOutputDefinition,
  ScoreDataTypeEnum,
  type PersistedEvalOutputDefinition,
} from "@langfuse/shared";

export type ScoreOutputDataType =
  | typeof ScoreDataTypeEnum.NUMERIC
  | typeof ScoreDataTypeEnum.CATEGORICAL
  | typeof ScoreDataTypeEnum.BOOLEAN;

export type ScoreOutputFormState = {
  dataType: ScoreOutputDataType;
  scoreDescription: string;
  reasoningDescription: string;
  categories: string[];
};

const DATA_TYPE_OPTIONS: { value: ScoreOutputDataType; label: string }[] = [
  { value: ScoreDataTypeEnum.NUMERIC, label: "Numeric" },
  { value: ScoreDataTypeEnum.CATEGORICAL, label: "Categorical" },
  { value: ScoreDataTypeEnum.BOOLEAN, label: "Boolean" },
];

/** Prefill from a persisted output definition (legacy → NUMERIC + descriptions). */
export function toScoreOutputFormState(
  outputDefinition: unknown,
): ScoreOutputFormState {
  const parsed =
    PersistedEvalOutputDefinitionSchema.safeParse(outputDefinition);
  if (!parsed.success) {
    const defaults = getDefaultOutputDefinitionFormValues();
    return {
      dataType: ScoreDataTypeEnum.NUMERIC,
      scoreDescription: defaults.scoreDescription,
      reasoningDescription: defaults.reasoningDescription,
      categories: [],
    };
  }
  const resolved = resolvePersistedEvalOutputDefinition(parsed.data);
  return {
    dataType: resolved.dataType,
    scoreDescription: resolved.scoreDescription,
    reasoningDescription: resolved.reasoningDescription,
    categories: "categories" in resolved ? resolved.categories : [],
  };
}

/**
 * Build the persisted (v2 structured) output definition from form state.
 * Returns null when the state is incomplete (empty descriptions, too few
 * categories) so callers can block save / test.
 */
export function buildScoreOutputDefinition(
  state: ScoreOutputFormState,
): PersistedEvalOutputDefinition | null {
  const candidate =
    state.dataType === ScoreDataTypeEnum.CATEGORICAL
      ? {
          version: 2,
          dataType: state.dataType,
          reasoning: { description: state.reasoningDescription.trim() },
          score: {
            description: state.scoreDescription.trim(),
            categories: state.categories
              .map((c) => c.trim())
              .filter((c) => c.length > 0),
            shouldAllowMultipleMatches: false,
          },
        }
      : {
          version: 2,
          dataType: state.dataType,
          reasoning: { description: state.reasoningDescription.trim() },
          score: { description: state.scoreDescription.trim() },
        };
  const parsed = PersistedEvalOutputDefinitionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function ScoreOutputSection({
  state,
  onChange,
}: {
  state: ScoreOutputFormState;
  onChange: (next: ScoreOutputFormState) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleDataTypeChange = (dataType: ScoreOutputDataType) => {
    // Swap in the matching default copy when the user has not customized it.
    const defaults = getDefaultOutputDefinitionFormValues({
      scoreDataType: dataType,
    });
    onChange({
      ...state,
      dataType,
      scoreDescription: shouldReplaceDefaultOutputDefinitionField({
        currentValue: state.scoreDescription,
        field: "scoreDescription",
      })
        ? defaults.scoreDescription
        : state.scoreDescription,
      reasoningDescription: shouldReplaceDefaultOutputDefinitionField({
        currentValue: state.reasoningDescription,
        field: "reasoningDescription",
      })
        ? defaults.reasoningDescription
        : state.reasoningDescription,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Score type</Label>
        <p className="text-muted-foreground text-sm">
          Choose whether the evaluator should return a numeric score, a boolean
          verdict, or one of a fixed set of categories.
        </p>
        <Select
          value={state.dataType}
          onValueChange={(value) =>
            handleDataTypeChange(value as ScoreOutputDataType)
          }
        >
          <SelectTrigger className="w-56">
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
      </div>

      {state.dataType === ScoreDataTypeEnum.CATEGORICAL && (
        <div className="flex flex-col gap-2">
          <Label>Categories (at least 2)</Label>
          <p className="text-muted-foreground text-sm">
            The fixed set of labels the judge must pick from.
          </p>
          {state.categories.map((category, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                placeholder={`Category ${index + 1}`}
                value={category}
                onChange={(e) => {
                  const categories = [...state.categories];
                  categories[index] = e.target.value;
                  onChange({ ...state, categories });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove category"
                onClick={() =>
                  onChange({
                    ...state,
                    categories: state.categories.filter((_, i) => i !== index),
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
            onClick={() =>
              onChange({ ...state, categories: [...state.categories, ""] })
            }
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add category
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <button
          type="button"
          // -ml-5.5 hangs the chevron into the step gutter (mirroring the
          // step headers) so the label text aligns with sibling labels.
          className="-ml-5.5 flex w-fit items-center gap-1.5 text-sm font-medium"
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
              <Label>Score description</Label>
              <p className="text-muted-foreground text-sm">
                Tells the judge what the score should express and how to use the
                scale.
              </p>
              <Textarea
                className="min-h-16"
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
