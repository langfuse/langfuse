import { useId, useState } from "react";
import { filterOperators, type FilterState } from "@langfuse/shared";
import { Filter, PanelLeftClose, Plus, X } from "lucide-react";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";
import { Button } from "@/src/components/ui/button";
import { PopoverController } from "@/src/components/ui/popover";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { ScoreTag } from "@/src/components/score-tag";
import { useDataTableControls } from "@/src/components/table/data-table-controls";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { type ExperimentItemScoreFilterOptions } from "../../types/charts";
import { cn } from "@/src/utils/tailwind";
import {
  completeExperimentFilter,
  editExperimentFilter,
  EXPERIMENT_FILTER_KINDS,
  experimentFilterToDraft,
  type ExperimentFilterDraft,
} from "./experimentFilterEditing";
import {
  AvailableExperimentFilters,
  ExperimentFilterCreationContent,
} from "./ExperimentFilterCreation";

type TargetOption = { id: string; label: string; textClassName?: string };
type TargetOptions = ExperimentItemScoreFilterOptions & {
  itemMetadata?: Record<string, string[]>;
  eventMetadata?: Record<string, string[]>;
};

type ExperimentFilterSidebarProps = {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onClearAll: () => void;
  targets: readonly TargetOption[];
  optionsByTarget: Readonly<Record<string, TargetOptions | undefined>>;
  /** The shared mobile Filters sheet owns the outer scrolling and header. */
  layout?: "panel" | "inline";
};

function scoreNames(
  draft: ExperimentFilterDraft,
  options: TargetOptions | undefined,
): string[] {
  if (draft.type === "numberObject") return options?.scores_avg ?? [];
  if (draft.type === "categoryOptions")
    return Object.keys(options?.score_categories ?? {});
  if (draft.type === "booleanObject") return options?.score_booleans ?? [];
  return [];
}

function scoreLevels(
  draft: ExperimentFilterDraft,
  options: TargetOptions | undefined,
) {
  if (draft.type === "numberObject")
    return options?.score_name_levels_numeric?.[draft.key];
  if (draft.type === "categoryOptions")
    return options?.score_name_levels_categorical?.[draft.key];
  if (draft.type === "booleanObject")
    return options?.score_name_levels_boolean?.[draft.key];
  return undefined;
}

function incompatibleScore(
  draft: ExperimentFilterDraft,
  options: TargetOptions | undefined,
): boolean {
  if (!options || !draft.key || draft.type === "stringObject") return false;
  const allNames = new Set([
    ...(options.scores_avg ?? []),
    ...Object.keys(options.score_categories ?? {}),
    ...(options.score_booleans ?? []),
  ]);
  return (
    allNames.has(draft.key) && !scoreNames(draft, options).includes(draft.key)
  );
}

function FilterValueEditor({
  draft,
  options,
  onChange,
}: {
  draft: ExperimentFilterDraft;
  options: TargetOptions | undefined;
  onChange: (value: ExperimentFilterDraft["value"]) => void;
}) {
  if (draft.type === "stringOptions" || draft.type === "categoryOptions") {
    const values = Array.isArray(draft.value) ? draft.value : [];
    const offered =
      draft.type === "stringOptions"
        ? (options?.level ?? ["DEBUG", "DEFAULT", "WARNING", "ERROR"])
        : (options?.score_categories?.[draft.key] ?? []);
    return (
      <MultiSelectInput
        aria-label="Filter values"
        value={values}
        options={[...new Set([...offered, ...values])].map((value) => ({
          value,
          label: value,
        }))}
        onValueChange={onChange}
        placeholder="Select values"
        selectedLabel={values.join(", ")}
        searchPlaceholder="Search values"
        emptyMessage={options ? "No values for this score" : "Loading values…"}
      />
    );
  }
  if (draft.type === "booleanObject" || draft.type === "boolean") {
    return (
      <SelectInput
        aria-label="Filter value"
        value={String(draft.value)}
        options={[
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ]}
        onValueChange={onChange}
        placeholder="Select value"
      />
    );
  }
  return (
    <Input
      aria-label="Filter value"
      value={String(draft.value)}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Value"
      inputMode={draft.type === "numberObject" ? "decimal" : "text"}
    />
  );
}

/** Only the unfinished edit buffer is local; applied conditions belong to the URL. */
function ExperimentFilterBlock({
  initialDraft,
  targets,
  optionsByTarget,
  onApply,
  onRemove,
}: {
  initialDraft: ExperimentFilterDraft;
  targets: readonly TargetOption[];
  optionsByTarget: ExperimentFilterSidebarProps["optionsByTarget"];
  onApply: (filter: FilterState[number]) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const id = useId();
  const options = optionsByTarget[draft.target];
  const kind = EXPERIMENT_FILTER_KINDS.find(
    (entry) => entry.column === draft.column,
  );
  const target = targets.find((entry) => entry.id === draft.target);
  const isScore = ["numberObject", "booleanObject", "categoryOptions"].includes(
    draft.type,
  );
  const isMetadata = draft.type === "stringObject";
  const presence =
    isMetadata && ["is set", "is not set"].includes(draft.operator);
  const availableNames = scoreNames(draft, options);
  const levels = scoreLevels(draft, options);
  const invalidType = isScore && incompatibleScore(draft, options);
  const scoreOptionsUnavailable = isScore && options === undefined;
  const completed = completeExperimentFilter(draft);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const title = kind?.label ?? draft.column;
  const availableTargets = targets.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));
  if (!target)
    availableTargets.push({
      value: draft.target,
      label: `Unavailable experiment (${draft.target})`,
    });

  return (
    <form
      className="ph-no-capture flex min-w-0 flex-col gap-2 rounded-md border p-3"
      aria-label={`${title} filter`}
      onSubmit={(event) => {
        event.preventDefault();
        if (
          completed &&
          target &&
          !invalidType &&
          !scoreOptionsUnavailable &&
          hasChanges
        )
          onApply(completed);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold">{title}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          aria-label={`Remove ${title} filter`}
          onClick={onRemove}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className={cn("flex flex-col gap-1", target?.textClassName)}>
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
          options={availableTargets}
          onValueChange={(value) => setDraft({ ...draft, target: value })}
          placeholder="Select experiment"
          search={{ placeholder: "Search experiments" }}
          error={!target}
        />
      </div>
      {!target && (
        <p role="alert" className="text-destructive text-xs">
          Select an available experiment to apply this filter.
        </p>
      )}
      {isScore && (
        <>
          <SelectInput
            aria-label="Score name"
            value={draft.key}
            options={[
              ...new Set([
                ...availableNames,
                ...(draft.key ? [draft.key] : []),
              ]),
            ].map((value) => ({ value, label: value }))}
            onValueChange={(value) => setDraft({ ...draft, key: value })}
            placeholder="Select score"
            search={{ placeholder: "Search scores" }}
            emptyMessage={
              options ? "No scores of this type" : "Loading scores…"
            }
            error={invalidType}
          />
          {levels && (
            <div className="flex flex-wrap gap-1">
              {levels.map((level) => (
                <ScoreTag key={level} level={level} />
              ))}
            </div>
          )}
        </>
      )}
      {isMetadata && (
        <Input
          aria-label="Metadata key"
          placeholder="Metadata key"
          value={draft.key}
          onChange={(event) => setDraft({ ...draft, key: event.target.value })}
        />
      )}
      <SelectInput
        aria-label="Filter operator"
        value={draft.operator}
        options={filterOperators[draft.type].map((value) => ({
          value,
          label: value,
        }))}
        onValueChange={(value) => setDraft({ ...draft, operator: value })}
        placeholder="Select operator"
      />
      {!presence && (
        <FilterValueEditor
          draft={draft}
          options={options}
          onChange={(value) => setDraft({ ...draft, value })}
        />
      )}
      {invalidType && (
        <p role="alert" className="text-destructive text-xs">
          This score has a different type in the selected experiment. Choose a
          compatible score or experiment.
        </p>
      )}
      {scoreOptionsUnavailable && target && (
        <p role="status" className="text-muted-foreground text-xs">
          Waiting for score options for this experiment before applying.
        </p>
      )}
      {hasChanges && (
        <Button
          type="submit"
          size="sm"
          disabled={
            !completed || !target || invalidType || scoreOptionsUnavailable
          }
        >
          Apply changes
        </Button>
      )}
    </form>
  );
}

export function ExperimentFilterSidebar({
  filters,
  onChange,
  onClearAll,
  targets,
  optionsByTarget,
  layout = "panel",
}: ExperimentFilterSidebarProps) {
  const { open, setOpen, isMobile } = useDataTableControls();
  const capture = usePostHogClientCapture();
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const activeOnlyId = useId();
  const occurrences = new Map<string, number>();
  const filterBlocks = filters.map((filter, index) => {
    const identity = JSON.stringify(filter);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { filter, index, key: `${identity}:${occurrence}` };
  });

  const apply = (filter: FilterState[number], index?: number) => {
    const next =
      index === undefined
        ? [...filters, filter]
        : editExperimentFilter(filters, index, filter);
    if (JSON.stringify(next) === JSON.stringify(filters)) return;
    onChange(next);
    capture("filters:applied", {
      surface: "sidebar",
      tableName: "experiment-items",
      isV4: true,
      column: filter.column,
      filterType: filter.type,
      operator: filter.operator,
      conditionCount: next.length,
      columnConditionCount: next.filter(
        (entry) => entry.column === filter.column,
      ).length,
      valueCount: Array.isArray(filter.value) ? filter.value.length : 1,
      targetKind: ["all", "baseline"].includes(filter.target ?? "baseline")
        ? (filter.target ?? "baseline")
        : "experiment",
    });
  };
  const remove = (index: number) => {
    onChange(editExperimentFilter(filters, index, null));
    capture("filters:cleared", {
      surface: "sidebar",
      tableName: "experiment-items",
      isV4: true,
      scope: "facet",
      column: filters[index].column,
      clearedCount: 1,
    });
  };
  const toggleOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    capture("filters:sidebar_toggled", {
      tableName: "experiment-items",
      isV4: true,
      open: nextOpen,
      trigger: "header",
    });
  };

  if (layout === "panel" && !isMobile && !open)
    return (
      <div className="flex h-full justify-center pt-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Open filters"
          onClick={() => toggleOpen(true)}
        >
          <Filter className="size-4" />
        </Button>
      </div>
    );

  const sidebar = (
    <aside
      aria-label="Experiment filters"
      className={cn(
        "flex min-w-0 flex-col",
        layout === "panel" && "h-full overflow-hidden",
      )}
    >
      {layout === "panel" && (
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <span className="text-sm font-bold">
            Filters{filters.length > 0 && ` (${filters.length})`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Collapse filters"
            onClick={() => toggleOpen(false)}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </div>
      )}
      <div
        className={cn(
          "flex flex-col gap-3 p-3",
          layout === "panel" && "min-h-0 flex-1 overflow-y-auto",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor={activeOnlyId}
            className="text-muted-foreground flex items-center gap-2 text-xs"
          >
            <Checkbox
              id={activeOnlyId}
              checked={showOnlyActive}
              onCheckedChange={(checked) => {
                const enabled = checked === true;
                setShowOnlyActive(enabled);
                capture("filters:active_only_toggled", {
                  tableName: "experiment-items",
                  isV4: true,
                  enabled,
                });
              }}
            />
            Show only active
          </label>
          {filters.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1 text-xs"
              onClick={onClearAll}
            >
              Clear all
            </Button>
          )}
        </div>
        {filters.length === 0 && (
          <p className="text-muted-foreground py-3 text-center text-xs">
            No active filters.
          </p>
        )}
        {filterBlocks.map(({ filter, index, key }) => (
          <ExperimentFilterBlock
            key={key}
            initialDraft={experimentFilterToDraft(filter)}
            targets={targets}
            optionsByTarget={optionsByTarget}
            onApply={(replacement) => apply(replacement, index)}
            onRemove={() => remove(index)}
          />
        ))}
        {!showOnlyActive && (
          <AvailableExperimentFilters
            options={optionsByTarget.all}
            onAdd={(filter) => apply(filter)}
            portalContainer={portalContainer}
          />
        )}
        <PopoverController
          align="start"
          contentClassName="ph-no-capture w-72"
          disabled={false}
          modal={false}
          portalContainer={portalContainer}
          renderContent={({ closePopover }) => (
            <ExperimentFilterCreationContent
              options={optionsByTarget.all}
              onCancel={closePopover}
              onAdd={(filter) => {
                apply(filter);
                closePopover();
              }}
            />
          )}
        >
          {({ Trigger }) => (
            <Trigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="size-3.5" />
                Add filter
              </Button>
            </Trigger>
          )}
        </PopoverController>
      </div>
    </aside>
  );

  return (
    <>
      {sidebar}
      {layout === "inline" && (
        <div data-layer="popover" ref={setPortalContainer} />
      )}
    </>
  );
}
