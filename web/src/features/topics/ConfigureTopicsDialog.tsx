import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ExternalLinkIcon,
  Info,
  RefreshCcw,
} from "lucide-react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Input } from "@/src/components/design-system/Input/Input";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Button as LegacyButton } from "@/src/components/ui/button";
import { PopoverTrigger } from "@/src/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import {
  EventsSearchBarRow,
  toObservedOptions,
  useEventsSearchBar,
} from "@/src/features/search-bar";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { RuleSamplingSection } from "@/src/features/evals/v2/components/Rules/RuleSetup/components/RuleSamplingSection";
import { createRuleSetupStore } from "@/src/features/evals/v2/stores/createRuleSetupStore";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";
import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import {
  JudgeModelPicker,
  JudgeModelPickerTrigger,
} from "@/src/features/evals/v2/components/Evaluators/JudgeModelPicker/JudgeModelPicker";
import { type JudgeModel } from "@/src/features/evals/v2/judgeModel";
import { format } from "date-fns";
import {
  eventsEvalFilterColumns,
  experimentEvalFilterColsWithOptions,
  observationEvalFilterColsWithOptions,
  type FilterState,
  type TimeFilter,
  type TracingSearchType,
} from "@langfuse/shared";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { api, sendAsPostOption } from "@/src/utils/api";
import { relativeTopicTimeRange } from "./time-range";

type FacetDraft = {
  id: string;
  name: string;
  question: string;
  builtIn: boolean;
  enabled: boolean;
};

const MAX_ENABLED_FACETS = 5;
const ADD_FACET_TAB = "add-facet";

export type TopicSlotCheck = {
  status: "idle" | "testing" | "ok" | "error";
  message?: string;
};

export type ConfigureTopicsSaveDraft = {
  summary: JudgeModel | null;
  embedding: JudgeModel | null;
  embeddingDimensions: string;
  clustering: JudgeModel | null;
  facets: FacetDraft[];
  filters: FilterState;
  sampling: number;
  idleSeconds: string;
};

export type ConfigureTopicsDraft = {
  summary: JudgeModel | null;
  embedding: JudgeModel | null;
  embeddingDimensions: string;
  clustering: JudgeModel | null;
  facets: FacetDraft[];
  filters: FilterState;
  sampling: number;
  idleSeconds: string;
  embeddingLocked: boolean;
};

type ConfigureTopicsDialogProps = {
  providerGroups: Array<[string, string[]]>;
  embeddingProviderGroups?: Array<[string, string[]]>;
  draft: ConfigureTopicsDraft;
  defaultOpen: boolean;
  defaultTestOpen: boolean;
  onConfigureProviders: () => void;
  onSave: (draft: ConfigureTopicsSaveDraft) => void | Promise<void>;
  onSlotCommit?: (
    slot: "summary" | "embedding" | "clustering",
    model: JudgeModel,
    dimensions: string,
  ) => void;
  slotChecks?: Partial<
    Record<"summary" | "embedding" | "clustering", TopicSlotCheck>
  >;
  canWrite?: boolean;
  saving?: boolean;
  saveError?: string | null;
  projectId?: string;
  /** Storybook keeps the sample filter. The project page chooses traces when a run starts. */
  sampleScope?: boolean;
  triggerVariant: "primary" | "secondary";
} & (
  | { notice: "none" }
  | {
      notice: "paused";
      shortLabel: string;
      pausedAgo: string;
      message: string;
    }
);

const SLOT_COPY = {
  summary: {
    label: "Facet summaries",
    hint: "A small, fast model. It runs once per trace.",
  },
  embedding: {
    label: "Embeddings",
    hint: "Locked after the first summaries are embedded.",
  },
  clustering: {
    label: "Topic clustering",
    hint: "Names each topic when topics are updated.",
  },
} as const;

const SAMPLE_TRACES = [
  {
    id: "billing",
    name: "Billing question",
    answers: {
      intent: "The user wants a charge explained.",
      outcome: "Not yet. The assistant asked for the invoice id.",
    } as Record<string, string>,
  },
  {
    id: "weather",
    name: "Weather question",
    answers: {
      intent: "The user wants tomorrow's forecast.",
      outcome: "Yes. The assistant gave the forecast.",
    } as Record<string, string>,
  },
];

export function ConfigureTopicsDialog(props: ConfigureTopicsDialogProps) {
  const {
    defaultOpen,
    defaultTestOpen,
    draft,
    canWrite = true,
    onConfigureProviders,
    onSave,
    onSlotCommit,
    projectId,
    providerGroups,
    embeddingProviderGroups = providerGroups,
    sampleScope = true,
    saveError = null,
    saving = false,
    slotChecks,
    triggerVariant,
  } = props;
  const paused =
    props.notice === "paused"
      ? {
          shortLabel: props.shortLabel,
          pausedAgo: props.pausedAgo,
          message: props.message,
        }
      : null;
  const [open, setOpen] = useState(defaultOpen);
  const [testOpen, setTestOpen] = useState(defaultTestOpen);
  const [tested, setTested] = useState(defaultTestOpen);
  const [summary, setSummary] = useState(draft.summary);
  const [embedding, setEmbedding] = useState(draft.embedding);
  const [dimensions, setDimensions] = useState(draft.embeddingDimensions);
  const [clustering, setClustering] = useState(draft.clustering);
  const [facets, setFacets] = useState(draft.facets);
  const [browsing, setBrowsing] = useState(facets[0]?.id ?? ADD_FACET_TAB);
  const [idleSeconds, setIdleSeconds] = useState(draft.idleSeconds);
  const [filters, setFilters] = useState(draft.filters);
  const [samplingStore] = useState(() =>
    createRuleSetupStore({
      name: "",
      filter: [],
      sampling: draft.sampling,
      assignments: [],
    }),
  );
  const modelsReady = Boolean(summary && embedding && clustering);
  const enabledFacets = facets.filter((facet) => facet.enabled);
  const testsReady =
    !slotChecks ||
    (["summary", "embedding", "clustering"] as const).every(
      (slot) => slotChecks[slot]?.status === "ok",
    );
  const canSave =
    canWrite &&
    !saving &&
    modelsReady &&
    enabledFacets.length > 0 &&
    testsReady;
  const browsed = facets.find((facet) => facet.id === browsing) ?? null;
  const atFacetCap = enabledFacets.length >= MAX_ENABLED_FACETS;
  const commitSlot = (
    slot: "summary" | "embedding" | "clustering",
    model: JudgeModel,
    nextDimensions = dimensions,
  ) => {
    onSlotCommit?.(slot, model, nextDimensions);
  };
  const setFacetEnabled = (id: string, enabled: boolean) => {
    setFacets((current) => {
      const enabledCount = current.filter((facet) => facet.enabled).length;
      const target = current.find((facet) => facet.id === id);
      if (
        enabled &&
        target &&
        !target.enabled &&
        enabledCount >= MAX_ENABLED_FACETS
      )
        return current;
      return current.map((facet) =>
        facet.id === id ? { ...facet, enabled } : facet,
      );
    });
  };

  return (
    <div className="flex flex-col items-start gap-4">
      <Button
        text="Configure Topics"
        variant={triggerVariant}
        size="sm"
        onClick={() => setOpen(true)}
      />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          overlayClassName="bg-transparent"
          className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        >
          <SheetHeader className="items-start space-y-1 p-6 pb-4 text-left">
            <SheetTitle>Configure Topics</SheetTitle>
            <SheetDescription>
              Models, what to look for, and which traces to run.
            </SheetDescription>
          </SheetHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              Promise.resolve(
                onSave({
                  summary,
                  embedding,
                  embeddingDimensions: dimensions,
                  clustering,
                  facets,
                  filters,
                  sampling: samplingStore.getState().sampling,
                  idleSeconds,
                }),
              )
                .then(() => setOpen(false))
                .catch(() => undefined);
            }}
          >
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4">
              <Alert variant="info" icon={Info}>
                <Alert.Description>
                  Incoming traces are processed automatically only when
                  ingestion is v4-ready. Legacy ingestion is not included.
                </Alert.Description>
              </Alert>
              {paused ? (
                <PausedNotice
                  shortLabel={paused.shortLabel}
                  pausedAgo={paused.pausedAgo}
                  message={paused.message}
                  onConfigureProviders={onConfigureProviders}
                />
              ) : null}
              <Stepper
                number={1}
                title="Models"
                description="The connections and models used for summaries, embeddings, and clustering."
                compactBottomSpacing
              >
                <ModelSlot
                  name="summary"
                  model={summary}
                  locked={false}
                  disabled={!canWrite}
                  check={slotChecks?.summary}
                  connectionMissing={paused !== null}
                  providerGroups={providerGroups}
                  onConfigureProviders={onConfigureProviders}
                  onSelect={(model) => {
                    setSummary(model);
                    commitSlot("summary", model);
                  }}
                />
                <ModelSlot
                  name="embedding"
                  model={embedding}
                  locked={draft.embeddingLocked}
                  disabled={!canWrite}
                  check={slotChecks?.embedding}
                  dimensions={dimensions}
                  onDimensionsChange={(value) => {
                    setDimensions(value);
                    if (embedding) commitSlot("embedding", embedding, value);
                  }}
                  providerGroups={embeddingProviderGroups}
                  onConfigureProviders={onConfigureProviders}
                  onSelect={(model) => {
                    setEmbedding(model);
                    commitSlot("embedding", model);
                  }}
                />
                <ModelSlot
                  name="clustering"
                  model={clustering}
                  locked={false}
                  disabled={!canWrite}
                  check={slotChecks?.clustering}
                  providerGroups={providerGroups}
                  onConfigureProviders={onConfigureProviders}
                  onSelect={(model) => {
                    setClustering(model);
                    commitSlot("clustering", model);
                  }}
                />
              </Stepper>
              <Stepper
                number={2}
                title="Insights"
                description="Choose which questions you want answered. Five can be on."
                compactBottomSpacing
              >
                <FacetPicker
                  facets={facets}
                  browsing={browsing}
                  browsed={browsed}
                  atCap={atFacetCap}
                  canWrite={canWrite}
                  onBrowse={setBrowsing}
                  onEnabledChange={setFacetEnabled}
                />
              </Stepper>
              <Stepper
                number={3}
                title="Run settings"
                description={
                  sampleScope
                    ? "Choose which traces to include, and how long to wait after the last observation before considering the trace done and summarizing it."
                    : "Choose how long to wait after the last observation before considering the trace done and summarizing it, and which traces to include when you process them."
                }
                compactBottomSpacing
              >
                <div className="flex items-center gap-2">
                  <div className="w-24">
                    <Input
                      aria-label="Seconds to wait after the last observation"
                      type="number"
                      inputMode="numeric"
                      value={idleSeconds}
                      onChange={(event) => setIdleSeconds(event.target.value)}
                    />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    seconds to wait after the last observation before
                    considering the trace done and summarizing it.
                  </p>
                </div>
                {sampleScope ? (
                  <RuleScope
                    projectId={projectId}
                    filters={filters}
                    onFiltersChange={setFilters}
                    samplingStore={samplingStore}
                  />
                ) : null}
              </Stepper>
            </div>
            {saveError ? (
              <p className="text-destructive px-6 pb-2 text-sm">{saveError}</p>
            ) : null}
            <div className="mt-auto flex items-center justify-between gap-2 border-t p-4">
              {sampleScope ? (
                <LegacyButton
                  type="button"
                  variant="outline"
                  disabled={!canSave}
                  onClick={() => setTestOpen(true)}
                >
                  Test
                </LegacyButton>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <LegacyButton
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </LegacyButton>
                <LegacyButton type="submit" disabled={!canSave}>
                  {saving ? "Saving…" : "Save"}
                </LegacyButton>
              </div>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <Sheet open={testOpen} onOpenChange={setTestOpen}>
        <SheetContent
          overlayClassName="bg-transparent"
          className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <SheetHeader className="items-start space-y-1 p-6 pb-4 text-left">
            <SheetTitle>Test Topics</SheetTitle>
            <SheetDescription>
              One sample pass on two recent traces. Nothing is saved.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pb-4">
            {SAMPLE_TRACES.map((trace) => (
              <section key={trace.id} className="rounded-md border px-3 py-2">
                <h3 className="text-sm font-bold">{trace.name}</h3>
                <ul className="mt-2 flex flex-col gap-2">
                  {enabledFacets.map((facet) => (
                    <li key={facet.id}>
                      <p className="text-sm">{facet.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {tested
                          ? (trace.answers[facet.id] ??
                            "No sample for this facet yet.")
                          : "Run the test to preview this answer."}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="mt-auto flex justify-end gap-2 border-t p-4">
            <LegacyButton
              type="button"
              variant="outline"
              onClick={() => setTestOpen(false)}
            >
              Close
            </LegacyButton>
            <LegacyButton type="button" onClick={() => setTested(true)}>
              Run test
            </LegacyButton>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ModelSlot({
  check,
  connectionMissing = false,
  dimensions,
  disabled = false,
  locked,
  model,
  name,
  onConfigureProviders,
  onDimensionsChange,
  onSelect,
  providerGroups,
}: {
  check?: TopicSlotCheck;
  connectionMissing?: boolean;
  dimensions?: string;
  disabled?: boolean;
  locked: boolean;
  model: JudgeModel | null;
  name: keyof typeof SLOT_COPY;
  onConfigureProviders: () => void;
  onDimensionsChange?: (dimensions: string) => void;
  onSelect: (model: JudgeModel) => void;
  providerGroups: Array<[string, string[]]>;
}) {
  const [open, setOpen] = useState(false);
  const copy = SLOT_COPY[name];
  const inactive = locked || disabled;
  const controls = (
    <>
      <div
        className={`min-w-0 flex-1 [&_button]:w-full ${inactive ? "[&_button]:pointer-events-none" : ""}`}
      >
        <JudgeModelPicker
          purpose="decision"
          open={open && !inactive}
          onOpenChange={setOpen}
          providerGroups={providerGroups}
          selectedModel={model}
          onSelect={onSelect}
          onConfigureProviders={onConfigureProviders}
        >
          <PopoverTrigger asChild>
            <JudgeModelPickerTrigger
              mode={model ? "custom" : "default"}
              selectedModel={model}
              disabled={inactive}
              modelAvailability={connectionMissing ? "missing" : "available"}
            />
          </PopoverTrigger>
        </JudgeModelPicker>
      </div>
      {dimensions !== undefined ? (
        <div
          className={`w-20 shrink-0 ${inactive ? "pointer-events-none" : ""}`}
        >
          <Input
            aria-label="Embedding dimensions"
            type="number"
            inputMode="numeric"
            value={dimensions}
            disabled={inactive}
            onChange={(event) => onDimensionsChange?.(event.target.value)}
          />
        </div>
      ) : null}
    </>
  );
  const fields = (
    <div className="flex min-w-0 flex-1 items-center gap-2">{controls}</div>
  );
  return (
    <div className="flex items-start gap-2">
      <p
        className="flex h-8 w-36 shrink-0 items-center text-sm font-bold"
        title={copy.hint}
      >
        {copy.label}
      </p>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {locked ? (
          <Tooltip>
            <TooltipTrigger asChild>{fields}</TooltipTrigger>
            <TooltipContent side="bottom">{copy.hint}</TooltipContent>
          </Tooltip>
        ) : (
          fields
        )}
        {check?.status === "testing" ? (
          <p className="text-muted-foreground text-sm">Testing this model…</p>
        ) : null}
        {check?.status === "error" && check.message ? (
          <p className="text-destructive text-sm">{check.message}</p>
        ) : null}
      </div>
    </div>
  );
}

function FacetPicker({
  atCap,
  browsed,
  browsing,
  canWrite,
  facets,
  onBrowse,
  onEnabledChange,
}: {
  atCap: boolean;
  browsed: FacetDraft | null;
  browsing: string;
  canWrite: boolean;
  facets: FacetDraft[];
  onBrowse: (id: string) => void;
  onEnabledChange: (id: string, enabled: boolean) => void;
}) {
  const enabledCount = facets.filter((facet) => facet.enabled).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-full overflow-x-auto">
        <Tabs value={browsing} onValueChange={onBrowse}>
          <Tabs.List
            aria-label="Facets"
            variant="inset"
            size="sm"
            layout="packed"
          >
            {facets.map((facet) => (
              <Tabs.Trigger key={facet.id} value={facet.id} title={facet.name}>
                <span
                  className={`size-1.5 shrink-0 rounded-full ${facet.enabled ? "bg-dark-green" : "bg-border"}`}
                />
                <span className="truncate" title={facet.name}>
                  {facet.name}
                </span>
              </Tabs.Trigger>
            ))}
            <Tabs.Trigger value={ADD_FACET_TAB} label="Add my own" />
          </Tabs.List>
        </Tabs>
      </div>
      {browsed ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{browsed.question}</p>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={browsed.enabled}
              disabled={!canWrite || (atCap && !browsed.enabled)}
              aria-label={`Enable ${browsed.name}`}
              onCheckedChange={(checked) =>
                onEnabledChange(browsed.id, checked)
              }
            />
            {browsed.enabled ? "On" : "Off"}
            {browsed.builtIn ? (
              <span className="text-muted-foreground text-xs">Built-in</span>
            ) : null}
          </label>
          {atCap && !browsed.enabled ? (
            <p className="text-muted-foreground text-xs">
              Five facets can be on. Turn one off to enable another.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              {enabledCount} of {MAX_ENABLED_FACETS} on
            </p>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Custom questions are added on their own page. This setup uses the
          facets already in the project.
        </p>
      )}
    </div>
  );
}

const SAMPLE_TRACES_IN_SCOPE = [
  {
    start: "2026-10-08 15:58:44",
    type: "GENERATION",
    name: "billing-question",
    input: '{"role":"user","content":"My subscription invoice..."}',
  },
  {
    start: "2026-10-08 15:58:43",
    type: "GENERATION",
    name: "weather-question",
    input: '{"role":"user","content":"I\'m visiting Lisbon this..."}',
  },
  {
    start: "2026-10-08 15:54:02",
    type: "SPAN",
    name: "weather-question",
    input: '{"role":"user","content":"What is the weather in..."}',
  },
];

const topicsFilterRegistry = {
  ...RULE_FIELD_REGISTRY,
  aiFilterPrompt: true,
  fields: RULE_FIELD_REGISTRY.fields.filter(
    (field) => field.id !== "isRootObservation",
  ),
  columns: RULE_FIELD_REGISTRY.columns.filter(
    (column) => column.id !== "isRootObservation",
  ),
};

const queryOnlyColumnIds = topicsFilterRegistry.fields
  .filter((field) => field.directFilter === false)
  .map((field) => field.filterColumn ?? field.id);

const BUILDER_OPTION_COLUMNS = [
  "environment",
  "name",
  "traceTags",
  "traceName",
  "calledToolNames",
] as const;

function authoredTraceFilters(filters: FilterState): FilterState {
  return filters.flatMap((filter) => {
    if (filter.column === "isRootObservation") return [];
    if (filter.column === "tags")
      return [{ ...filter, column: "traceTags" as const }];
    return [filter];
  });
}

function matchCountLabel(count: number | null) {
  if (count === null) return null;
  const noun = count === 1 ? "match" : "matches";
  return `(${count} ${noun})`;
}

function previewStatus(
  pending: boolean,
  error: string | undefined,
  rowCount: number,
) {
  if (pending) return "Loading traces…";
  if (error) return error;
  if (rowCount === 0) return "No traces match this filter in the last 7 days.";
  return null;
}

function RuleScope({
  projectId,
  filters,
  onFiltersChange,
  samplingStore,
}: {
  projectId?: string;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  samplingStore: RuleSetupStore;
}) {
  if (!projectId)
    return (
      <SampleTraceScope
        filters={filters}
        onFiltersChange={onFiltersChange}
        samplingStore={samplingStore}
      />
    );
  return (
    <ProjectTraceScope
      projectId={projectId}
      filters={filters}
      onFiltersChange={onFiltersChange}
      samplingStore={samplingStore}
    />
  );
}

function SampleTraceScope({
  filters,
  onFiltersChange,
  samplingStore,
}: {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  samplingStore: RuleSetupStore;
}) {
  return (
    <TraceScopeFrame
      projectId={undefined}
      filters={filters}
      onFiltersChange={onFiltersChange}
      samplingStore={samplingStore}
      countLabel="Sample"
      rows={SAMPLE_TRACES_IN_SCOPE}
    />
  );
}

function ProjectTraceScope({
  projectId,
  filters,
  onFiltersChange,
  samplingStore,
}: {
  projectId: string;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  samplingStore: RuleSetupStore;
}) {
  const [range] = useState(() => relativeTopicTimeRange(7));
  const [mode, setMode] = useState<EvaluatorFilterExperience>("query");
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<TracingSearchType[]>([]);
  const startTimeFilter = useMemo<TimeFilter[]>(
    () => [
      {
        column: "startTime",
        type: "datetime",
        operator: ">=",
        value: range.from,
      },
      {
        column: "startTime",
        type: "datetime",
        operator: "<",
        value: range.to,
      },
    ],
    [range],
  );
  const authored = useMemo(() => authoredTraceFilters(filters), [filters]);
  const options = useEventsFilterOptions({
    projectId,
    startTimeFilter,
    refiningFilter: authored,
    isRootObservation: true,
    includeApproxCount: true,
    lazy: mode === "query",
    columns: mode === "query" ? undefined : [...BUILDER_OPTION_COLUMNS],
    enabled: true,
  });
  const observed = useMemo(
    () =>
      toObservedOptions(options.filterOptions, options.isFilterOptionsPending),
    [options.filterOptions, options.isFilterOptionsPending],
  );
  const previewFilters = useMemo<FilterState>(
    () => [
      ...authored,
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
      ...startTimeFilter,
    ],
    [authored, startTimeFilter],
  );
  const preview = api.events.listCursor.useQuery({
    projectId,
    filter: previewFilters,
    searchQuery,
    searchType,
    limit: 10,
  });
  const observations = preview.data?.observations ?? [];
  const ioTargets = observations.flatMap((observation) =>
    observation.traceId
      ? [{ id: observation.id, traceId: observation.traceId }]
      : [],
  );
  const startTimes = observations.map((observation) =>
    observation.startTime.getTime(),
  );
  const io = api.events.batchIO.useQuery(
    {
      projectId,
      observations: ioTargets,
      minStartTime: new Date(
        startTimes.length > 0 ? Math.min(...startTimes) : 0,
      ),
      maxStartTime: new Date(
        startTimes.length > 0 ? Math.max(...startTimes) : 0,
      ),
    },
    {
      ...sendAsPostOption,
      enabled: preview.isSuccess && ioTargets.length > 0,
    },
  );
  const inputById = new Map((io.data ?? []).map((row) => [row.id, row.input]));
  const builderColumns = useMemo(
    () =>
      experimentEvalFilterColsWithOptions(
        options.filterOptions,
        observationEvalFilterColsWithOptions(
          {
            ...options.filterOptions,
            tags: options.filterOptions?.traceTags,
          },
          [...eventsEvalFilterColumns],
        ),
      ).flatMap((column) =>
        column.id === "isRootObservation" ? [] : [column],
      ),
    [options.filterOptions],
  );
  const rows = observations.map((observation) => ({
    id: observation.id,
    start: format(observation.startTime, "yyyy-MM-dd HH:mm:ss"),
    type: observation.type,
    name: observation.name ?? "—",
    input: inputById.get(observation.id) ?? (io.isPending ? "…" : ""),
  }));
  const status = previewStatus(
    preview.isPending,
    preview.error?.message,
    rows.length,
  );

  return (
    <TraceScopeFrame
      projectId={projectId}
      mode={mode}
      filters={filters}
      searchQuery={searchQuery}
      observed={observed}
      builderColumns={builderColumns}
      erroredColumns={options.erroredColumns}
      onRequestColumns={options.requestColumns}
      countLabel={matchCountLabel(options.approxTotalCount)}
      description="Root observations from the last 7 days. Topics summarizes the whole trace."
      tooltip="The same filter Topics uses when it selects traces, limited to the last 7 days. Only root observations are shown."
      rows={rows}
      status={status}
      searchType={searchType}
      onModeChange={setMode}
      onFiltersChange={onFiltersChange}
      samplingStore={samplingStore}
      onSearchQueryChange={setSearchQuery}
      onSearchTypeChange={setSearchType}
    />
  );
}

function TraceScopeFrame({
  projectId,
  mode: modeProp,
  filters: filtersProp,
  searchQuery: searchQueryProp,
  searchType: searchTypeProp,
  observed,
  builderColumns,
  erroredColumns,
  onRequestColumns,
  countLabel,
  description,
  tooltip,
  rows,
  status,
  samplingStore,
  onModeChange,
  onFiltersChange,
  onSearchQueryChange,
  onSearchTypeChange,
}: {
  projectId?: string;
  mode?: EvaluatorFilterExperience;
  filters?: FilterState;
  searchQuery?: string | null;
  searchType?: TracingSearchType[];
  observed?: ReturnType<typeof toObservedOptions>;
  builderColumns?: ReturnType<typeof experimentEvalFilterColsWithOptions>;
  erroredColumns?: ReadonlySet<string>;
  onRequestColumns?: (columns: readonly string[]) => void;
  countLabel?: string | null;
  description?: string;
  tooltip?: string;
  rows: Array<{
    id?: string;
    start: string;
    type: string;
    name: string;
    input: string;
  }>;
  status?: string | null;
  samplingStore: RuleSetupStore;
  onModeChange?: (mode: EvaluatorFilterExperience) => void;
  onFiltersChange?: (filters: FilterState) => void;
  onSearchQueryChange?: (query: string | null) => void;
  onSearchTypeChange?: (searchType: TracingSearchType[]) => void;
}) {
  const [localMode, setLocalMode] =
    useState<EvaluatorFilterExperience>("query");
  const [localFilters, setLocalFilters] = useState<FilterState>([]);
  const [localSearchQuery, setLocalSearchQuery] = useState<string | null>(null);
  const [localSearchType, setLocalSearchType] = useState<TracingSearchType[]>(
    [],
  );
  const mode = modeProp ?? localMode;
  const filters = filtersProp ?? localFilters;
  const searchQuery = searchQueryProp ?? localSearchQuery;
  const searchType = searchTypeProp ?? localSearchType;
  const setMode = onModeChange ?? setLocalMode;
  const setFilters = onFiltersChange ?? setLocalFilters;
  const setSearchQuery = onSearchQueryChange ?? setLocalSearchQuery;
  const setSearchType = onSearchTypeChange ?? setLocalSearchType;
  const search = useEventsSearchBar({
    projectId,
    tableName: "topics-setup",
    enabled: true,
    filterState: filters,
    searchQuery,
    searchType,
    observed,
    setFilterState: setFilters,
    setSearchQuery,
    setSearchType,
    registry: topicsFilterRegistry,
  });

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Filter traces"
          meta={null}
          description="This filter applies to every facet that is on."
          tooltip="Only traces matching this filter are summarized. Topics always runs on whole traces."
          trailing={
            <FilterModeToggle
              mode={mode}
              onChange={(next) => {
                if (next === "builder" && searchQuery !== null)
                  search.applyFilters(filters);
                setMode(next);
              }}
            />
          }
        />
        {mode === "query" ? (
          <EventsSearchBarRow
            projectId={projectId}
            tableName="topics-setup"
            store={search.store}
            commit={search.commit}
            observed={observed}
            erroredColumns={erroredColumns}
            registry={topicsFilterRegistry}
            onApplyFilters={search.applyFilters}
            onRequestColumns={onRequestColumns}
            className="p-0"
          />
        ) : (
          <ObservationFilterBuilder
            columns={builderColumns ?? [...topicsFilterRegistry.columns]}
            filterState={filters}
            onChange={setFilters}
            queryOnlyColumnIds={queryOnlyColumnIds}
          />
        )}
      </section>
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Matching traces"
          meta={
            countLabel ? (
              <span className="text-muted-foreground text-sm">
                {countLabel}
              </span>
            ) : null
          }
          description={
            description ?? "A sample of traces this setup would include."
          }
          tooltip={
            tooltip ??
            "A fixed sample. The filter is applied when traces are processed, not in this table."
          }
          trailing={null}
        />
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground bg-background sticky top-0">
              <tr className="border-b">
                <th className="px-3 py-2 font-normal">Start time</th>
                <th className="px-3 py-2 font-normal">Type</th>
                <th className="px-3 py-2 font-normal">Name</th>
                <th className="px-3 py-2 font-normal">Input</th>
              </tr>
            </thead>
            <tbody>
              {status ? (
                <tr>
                  <td className="text-muted-foreground px-3 py-2" colSpan={4}>
                    {status}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id ?? `${row.start}-${row.name}`}
                    className="border-b last:border-b-0"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{row.start}</td>
                    <td className="px-3 py-2">{row.type}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td
                      className="text-muted-foreground max-w-48 truncate px-3 py-2"
                      title={row.input}
                    >
                      {row.input}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <RuleSamplingSection
        store={samplingStore}
        description="Set the percentage of matching traces Topics processes."
        tooltip="Topics processes this share of the traces that match the filter. A lower rate processes fewer traces."
      />
    </div>
  );
}

function PausedNotice({
  message,
  onConfigureProviders,
  pausedAgo,
  shortLabel,
}: {
  message: string;
  onConfigureProviders: () => void;
  pausedAgo: string;
  shortLabel: string;
}) {
  return (
    <section
      role="alert"
      className="border-light-yellow bg-light-yellow rounded-lg border"
    >
      <div className="flex gap-3 p-4">
        <AlertTriangle className="text-dark-yellow icon-base mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-foreground text-base font-bold">Topics paused</h2>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold">{shortLabel}</span>
            <span className="bg-border h-1 w-1 rounded-full" />
            <span>Paused {pausedAgo}</span>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">{message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <LegacyButton
              type="button"
              variant="outline"
              size="sm"
              onClick={onConfigureProviders}
            >
              <ExternalLinkIcon className="icon-base text-icon-foreground mr-1.5" />
              Open LLM connections
            </LegacyButton>
            <LegacyButton type="button" variant="outline" size="sm">
              <RefreshCcw className="icon-base text-icon-foreground mr-1.5" />
              Reactivate
            </LegacyButton>
          </div>
        </div>
      </div>
    </section>
  );
}
