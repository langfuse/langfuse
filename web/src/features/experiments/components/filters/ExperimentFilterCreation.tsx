import { useState } from "react";
import { type FilterState } from "@langfuse/shared";
import { Input } from "@/src/components/design-system/Input/Input";
import { ScoreTag } from "@/src/components/score-tag";
import { Button } from "@/src/components/ui/button";
import { PopoverController } from "@/src/components/ui/popover";
import { type ExperimentItemScoreFilterOptions } from "../../types/charts";
import {
  completeExperimentFilter,
  EXPERIMENT_FILTER_KINDS,
  newExperimentFilterDraft,
} from "./experimentFilterEditing";

type MetadataColumn = "itemMetadata" | "eventMetadata";
type CreationProps = {
  options: ExperimentItemScoreFilterOptions | undefined;
  onAdd: (filter: FilterState[number]) => void;
};

function creationChoices(options: CreationProps["options"]) {
  const nonNumericNames = new Set([
    ...(options?.score_booleans ?? []),
    ...Object.keys(options?.score_categories ?? {}),
  ]);
  return EXPERIMENT_FILTER_KINDS.map((kind) => {
    const draft = newExperimentFilterDraft(kind.column);
    let levels: NonNullable<
      ExperimentItemScoreFilterOptions["score_name_levels_numeric"]
    >[string] = [];
    if (kind.column === "level") draft.value = ["DEFAULT"];
    if (kind.column === "scores_avg") {
      draft.key =
        options?.scores_avg?.find(
          (name) => name.length > 0 && !nonNumericNames.has(name),
        ) ?? "";
      draft.operator = ">=";
      draft.value = "0";
      levels = options?.score_name_levels_numeric?.[draft.key] ?? [];
    }
    if (kind.column === "score_booleans") {
      draft.key =
        options?.score_booleans?.find((name) => name.length > 0) ?? "";
      draft.value = "true";
      levels = options?.score_name_levels_boolean?.[draft.key] ?? [];
    }
    if (kind.column === "score_categories") {
      const category = Object.entries(options?.score_categories ?? {}).find(
        ([name, values]) => name.length > 0 && values.length > 0,
      );
      draft.key = category?.[0] ?? "";
      draft.value = category ? [category[1][0]] : [];
      levels = options?.score_name_levels_categorical?.[draft.key] ?? [];
    }
    const metadataColumn = kind.type === "stringObject" ? kind.column : null;
    const filter = completeExperimentFilter(draft);
    let description = "Choose a key · is set";
    if (kind.column === "level") description = "DEFAULT";
    else if (!metadataColumn) {
      description = options ? "No scores of this type" : "Loading scores…";
      if (filter) {
        const value = Array.isArray(draft.value)
          ? JSON.stringify(draft.value[0])
          : draft.value;
        description = `${draft.key} ${draft.operator} ${value}`;
      }
    }
    return {
      ...kind,
      filter,
      metadataColumn,
      description,
      levels,
      disabled: !metadataColumn && !filter,
    };
  });
}

function CreationChoiceLabel({
  choice,
}: {
  choice: ReturnType<typeof creationChoices>[number];
}) {
  return (
    <>
      <span className="text-xs font-bold">{choice.label}</span>
      <span className="text-muted-foreground text-xs break-all">
        {choice.description}
      </span>
      {choice.levels.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {choice.levels.map((level) => (
            <ScoreTag key={level} level={level} />
          ))}
        </span>
      )}
    </>
  );
}

function MetadataFilterCreationForm({
  column,
  onAdd,
  onCancel,
}: {
  column: MetadataColumn;
  onAdd: CreationProps["onAdd"];
  onCancel: () => void;
}) {
  const [key, setKey] = useState("");
  const filter = completeExperimentFilter({
    ...newExperimentFilterDraft(column),
    operator: "is set",
    key,
  });
  return (
    <form
      className="ph-no-capture flex flex-col gap-3"
      aria-label="Add metadata filter"
      onSubmit={(event) => {
        event.preventDefault();
        if (filter) onAdd(filter);
      }}
    >
      <span className="text-sm font-bold">
        {column === "itemMetadata" ? "Item metadata" : "Metadata"}
      </span>
      <p className="text-muted-foreground text-xs">
        Key is set · All selected experiments
      </p>
      <Input
        aria-label="Metadata key"
        placeholder="Metadata key"
        value={key}
        onChange={(event) => setKey(event.target.value)}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!filter}>
          Add filter
        </Button>
      </div>
    </form>
  );
}

/** Creation state unmounts with the popover; only completed conditions escape. */
export function ExperimentFilterCreationContent({
  options,
  onAdd,
  onCancel,
}: CreationProps & { onCancel: () => void }) {
  const [metadataColumn, setMetadataColumn] = useState<MetadataColumn | null>(
    null,
  );
  if (metadataColumn)
    return (
      <MetadataFilterCreationForm
        column={metadataColumn}
        onAdd={onAdd}
        onCancel={onCancel}
      />
    );
  return (
    <div className="ph-no-capture flex flex-col gap-1">
      <p className="text-muted-foreground px-2 pb-2 text-xs">
        Add to all selected experiments
      </p>
      {creationChoices(options).map((choice) => (
        <Button
          key={choice.column}
          variant="ghost"
          className="h-auto flex-col items-start gap-1 p-2 text-left whitespace-normal"
          disabled={choice.disabled}
          onClick={() => {
            if (choice.metadataColumn) setMetadataColumn(choice.metadataColumn);
            else if (choice.filter) onAdd(choice.filter);
          }}
        >
          <CreationChoiceLabel choice={choice} />
        </Button>
      ))}
    </div>
  );
}

/** The inactive catalog adds the same defaults without creating editor drafts. */
export function AvailableExperimentFilters({
  options,
  onAdd,
  portalContainer,
}: CreationProps & { portalContainer: HTMLElement | null }) {
  return (
    <div
      className="ph-no-capture flex flex-col gap-1"
      aria-label="Available filters"
    >
      <p className="text-muted-foreground px-2 text-xs">Available filters</p>
      {creationChoices(options).map((choice) => {
        const column = choice.metadataColumn;
        if (column)
          return (
            <PopoverController
              key={column}
              align="start"
              contentClassName="ph-no-capture w-72"
              disabled={false}
              modal={false}
              portalContainer={portalContainer}
              renderContent={({ closePopover }) => (
                <MetadataFilterCreationForm
                  column={column}
                  onCancel={closePopover}
                  onAdd={(filter) => {
                    onAdd(filter);
                    closePopover();
                  }}
                />
              )}
            >
              {({ Trigger }) => (
                <Trigger asChild>
                  <Button
                    variant="ghost"
                    className="h-auto flex-col items-start gap-1 p-2 text-left whitespace-normal"
                  >
                    <CreationChoiceLabel choice={choice} />
                  </Button>
                </Trigger>
              )}
            </PopoverController>
          );
        return (
          <Button
            key={choice.column}
            variant="ghost"
            className="h-auto flex-col items-start gap-1 p-2 text-left whitespace-normal"
            disabled={choice.disabled}
            onClick={() => {
              if (choice.filter) onAdd(choice.filter);
            }}
          >
            <CreationChoiceLabel choice={choice} />
          </Button>
        );
      })}
    </div>
  );
}
