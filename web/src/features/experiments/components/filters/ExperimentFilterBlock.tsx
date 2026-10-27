import { useId } from "react";
import { useForm } from "react-hook-form";
import { filterOperators } from "@langfuse/shared";
import { X } from "@langfuse/icons";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { ScoreTag } from "@/src/components/ScoreTag";
import { cn } from "@/src/utils/tailwind";
import {
  completeExperimentFilter,
  EXPERIMENT_FILTER_KINDS,
  type ExperimentFilterDraft,
} from "./experimentFilterEditing";
import {
  type ExperimentFilterApply,
  type ExperimentFilterOptions,
  type ExperimentFilterTarget,
} from "./experimentFilterTypes";
import { ExperimentFilterValueEditor } from "./ExperimentFilterValueEditor";

/** Each keyed mount owns only its unfinished form values. */
export function ExperimentFilterBlock({
  initialDraft,
  index,
  targets,
  options,
  optionsError,
  onApply,
  onRemove,
}: ExperimentFilterBlockProps) {
  const form = useForm<ExperimentFilterDraft>({ defaultValues: initialDraft });
  const draft = form.watch();
  const id = useId();
  const state = prepareBlockState(draft, targets, options, optionsError);
  const isDirty = form.formState.isDirty;

  function handleApply(values: ExperimentFilterDraft) {
    const completed = completeExperimentFilter(values);
    if (completed && isDirty && state.canApply) onApply(completed, index);
  }
  function handleRemove() {
    onRemove(index);
  }
  function handleTargetChange(target: string) {
    form.setValue("target", target, { shouldDirty: true });
  }
  function handleScoreChange(key: string) {
    form.setValue("key", key, { shouldDirty: true });
  }
  function handleOperatorChange(operator: string) {
    form.setValue("operator", operator, { shouldDirty: true });
  }
  function handleValueChange(value: ExperimentFilterDraft["value"]) {
    form.setValue("value", value, { shouldDirty: true });
  }
  const handleSubmit = form.handleSubmit(handleApply);

  return (
    <form
      className="ph-no-capture flex min-w-0 flex-col gap-2 rounded-md border p-3"
      aria-label={`${state.title} filter`}
      onSubmit={handleSubmit}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold">{state.title}</span>
        <IconButton
          icon={X}
          label={`Remove ${state.title} filter`}
          size="sm"
          onClick={handleRemove}
        />
      </div>
      <div className={cn("flex flex-col gap-1", state.target?.textClassName)}>
        <label
          htmlFor={`${id}-target`}
          className="text-muted-foreground text-xs"
        >
          Experiment
        </label>
        <SelectInput
          id={`${id}-target`}
          aria-label="Filter experiment"
          value={draft.target}
          options={state.targets}
          onValueChange={handleTargetChange}
          placeholder="Select experiment"
          search={{ placeholder: "Search experiments" }}
          error={!state.target}
        />
      </div>
      {!state.target && (
        <p role="alert" className="text-destructive text-xs">
          Select an available experiment to apply this filter.
        </p>
      )}
      {state.isScore && (
        <>
          <SelectInput
            aria-label="Score name"
            value={draft.key}
            options={state.scoreNames}
            onValueChange={handleScoreChange}
            placeholder="Select score"
            search={{ placeholder: "Search scores" }}
            emptyMessage={state.emptyScoresMessage}
            error={state.invalidType}
          />
          {state.levels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {state.levels.map((level) => (
                <ScoreTag key={level} level={level} />
              ))}
            </div>
          )}
        </>
      )}
      {state.isMetadata && (
        <Input
          aria-label="Metadata key"
          placeholder="Metadata key"
          {...form.register("key")}
        />
      )}
      <SelectInput
        aria-label="Filter operator"
        value={draft.operator}
        options={filterOperators[draft.type].map((value) => ({
          value,
          label: value,
        }))}
        onValueChange={handleOperatorChange}
        placeholder="Select operator"
      />
      {!state.isPresence && (
        <ExperimentFilterValueEditor
          draft={draft}
          options={options}
          onChange={handleValueChange}
        />
      )}
      {state.invalidType && (
        <p role="alert" className="text-destructive text-xs">
          This score has a different type. Choose a compatible score.
        </p>
      )}
      {state.isWaiting && (
        <p role="status" className="text-muted-foreground text-xs">
          Waiting for score options before applying.
        </p>
      )}
      {isDirty && (
        <Button
          text="Apply changes"
          type="submit"
          size="sm"
          disabled={!state.canApply}
        />
      )}
    </form>
  );
}

function prepareBlockState(
  draft: ExperimentFilterDraft,
  targets: readonly ExperimentFilterTarget[],
  options: ExperimentFilterOptions | undefined,
  optionsError: string | null,
) {
  const kind = EXPERIMENT_FILTER_KINDS.find(
    (entry) => entry.column === draft.column,
  );
  const target = targets.find((entry) => entry.id === draft.target);
  const isScore = ["numberObject", "booleanObject", "categoryOptions"].includes(
    draft.type,
  );
  const isMetadata = draft.type === "stringObject";
  const availableNames = scoreNames(draft, options);
  const allNames = new Set([
    ...(options?.scores_avg ?? []),
    ...Object.keys(options?.score_categories ?? {}),
    ...(options?.score_booleans ?? []),
  ]);
  const invalidType =
    isScore && allNames.has(draft.key) && !availableNames.includes(draft.key);
  const availableTargets = targets.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));
  if (!target)
    availableTargets.push({
      value: draft.target,
      label: `Unavailable experiment (${draft.target})`,
    });
  let emptyScoresMessage = "Loading scores…";
  if (options) emptyScoresMessage = "No scores of this type";
  if (optionsError) emptyScoresMessage = "Score options unavailable";
  return {
    title: kind?.label ?? draft.column,
    target,
    targets: availableTargets,
    isScore,
    isMetadata,
    isPresence: isMetadata && ["is set", "is not set"].includes(draft.operator),
    scoreNames: [
      ...new Set([...availableNames, ...(draft.key ? [draft.key] : [])]),
    ].map((value) => ({ value, label: value })),
    levels: scoreLevels(draft, options),
    invalidType,
    emptyScoresMessage,
    isWaiting:
      isScore && options === undefined && !optionsError && Boolean(target),
    canApply: Boolean(
      completeExperimentFilter(draft) &&
      target &&
      !invalidType &&
      (!isScore || (options !== undefined && !optionsError)),
    ),
  };
}

function scoreNames(
  draft: ExperimentFilterDraft,
  options: ExperimentFilterOptions | undefined,
): string[] {
  if (draft.type === "numberObject") return options?.scores_avg ?? [];
  if (draft.type === "categoryOptions")
    return Object.keys(options?.score_categories ?? {});
  if (draft.type === "booleanObject") return options?.score_booleans ?? [];
  return [];
}

function scoreLevels(
  draft: ExperimentFilterDraft,
  options: ExperimentFilterOptions | undefined,
) {
  if (draft.type === "numberObject")
    return options?.score_name_levels_numeric?.[draft.key] ?? [];
  if (draft.type === "categoryOptions")
    return options?.score_name_levels_categorical?.[draft.key] ?? [];
  if (draft.type === "booleanObject")
    return options?.score_name_levels_boolean?.[draft.key] ?? [];
  return [];
}

type ExperimentFilterBlockProps = {
  initialDraft: ExperimentFilterDraft;
  index: number;
  targets: readonly ExperimentFilterTarget[];
  options: ExperimentFilterOptions | undefined;
  optionsError: string | null;
  onApply: ExperimentFilterApply;
  onRemove: (index: number) => void;
};
