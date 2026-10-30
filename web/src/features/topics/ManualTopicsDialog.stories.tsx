import { useState } from "react";
import {
  eventsEvalFilterColumns,
  observationEvalFilterColsWithOptions,
  type FilterState,
} from "@langfuse/shared";
import {
  TopicTraceSelectorView,
  type TopicTraceSelectorViewProps,
} from "./TopicTraceSelectorView";
import { TOPICS_BACKFILL_TRACE_LIMIT } from "./backfill-limit";
import {
  relativeTopicTimeRange,
  topicCalendarDates,
  topicCalendarRange,
} from "./time-range";
import { parseTraceInput } from "./parse-trace-input";
import { manualTopicsSelection } from "./manual-topics-selection";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  ManualTopicsDialog,
  type ManualTopicsDialogProps,
} from "./ManualTopicsDialog";

const facets: ManualTopicsDialogProps["facets"] = [
  {
    id: "intent",
    name: "Intent",
    summaries: 240,
    kind: "Built-in",
    version: 1,
    description: "What the user wants to accomplish.",
  },
  {
    id: "outcome",
    name: "Outcome",
    summaries: 24,
    kind: "Built-in",
    version: 1,
    description: "How the conversation ended.",
  },
  {
    id: "product",
    name: "Product area",
    summaries: 180,
    kind: "Custom",
    version: 2,
    description: "Which part of the product the conversation concerns.",
  },
];

const defaults: ManualTopicsDialogProps = {
  operation: "process",
  facets,
  selectedFacetIds: facets.map((facet) => facet.id),
  traceControls: null,
  count: 0,
  generationTimeRange: { range: "last7Days" },
  models: {
    summary: { model: "gpt-4.1-mini", connection: "OpenAI" },
    embedding: { model: "text-embedding-3-small", connection: "OpenAI" },
    clustering: { model: "gpt-4.1-mini", connection: "OpenAI" },
  },
  reuse: true,
  smallSample: false,
  canSubmit: true,
  isSubmitting: false,
  disabledReason: null,
  error: null,
  onOperationChange: fn(),
  onToggleFacet: fn(),
  onGenerationTimeRangeChange: fn(),
  onReuseChange: fn(),
  onSmallSampleChange: fn(),
  onSubmit: fn(),
  onConfigure: fn(),
};

const meta = preview.meta({
  component: ManualTopicsDialog,
  parameters: { layout: "fullscreen" },
  args: defaults,
  render: function DialogStory(args) {
    const [draft, setDraft] = useState({
      operation: args.operation,
      selectedFacetIds: args.selectedFacetIds,
      reuse: args.reuse,
      smallSample: args.smallSample,
      generationTimeRange: args.generationTimeRange,
    });
    const [criteria, setCriteria] = useState({
      mode: "filters",
      filter: [] as FilterState,
      timeWindow: "7",
      range: relativeTopicTimeRange(7),
      limit: String(TOPICS_BACKFILL_TRACE_LIMIT),
      sampling: "random" as "random" | "latest",
      paste: "",
    });
    const [filterMode, setFilterMode] = useState<"builder" | "query">(
      "builder",
    );
    const [batch, setBatch] = useState<{
      key: string;
      data: Extract<
        TopicTraceSelectorViewProps["preview"],
        { status: "ready" }
      >["data"];
    } | null>(null);
    const [excluded, setExcluded] = useState<string[]>([]);
    const key = JSON.stringify(criteria);
    const ready = batch?.key === key ? batch : null;
    let pastedCount: number | null = null;
    let pasteError: string | null = null;
    if (criteria.mode === "paste" && criteria.paste.trim()) {
      try {
        pastedCount = parseTraceInput(
          criteria.paste,
          "storybook",
          window.location.origin,
        ).length;
        if (pastedCount > TOPICS_BACKFILL_TRACE_LIMIT)
          throw new Error("Select at most 1,000 traces per run.");
      } catch (error) {
        pastedCount = null;
        pasteError =
          error instanceof Error ? error.message : "Invalid trace IDs.";
      }
    }
    let count = ready ? ready.data.selectedTraceCount - excluded.length : 0;
    if (criteria.mode === "paste") count = pastedCount ?? 0;
    const selectionStatus = manualTopicsSelection({
      operation: draft.operation,
      summaryCounts: args.facets
        .filter((facet) => draft.selectedFacetIds.includes(facet.id))
        .map((facet) => facet.summaries ?? 0),
      traceCount: count,
      smallSample: draft.smallSample,
    });
    function changeCriteria(change: Partial<typeof criteria>) {
      setCriteria((current) => ({ ...current, ...change }));
      setBatch(null);
      setExcluded([]);
    }
    function handleModeChange(mode: string) {
      changeCriteria({ mode });
    }
    function handleFilterChange(filter: FilterState) {
      changeCriteria({ filter });
    }
    function handleTimeWindowChange(timeWindow: string) {
      changeCriteria({
        timeWindow,
        range:
          timeWindow === "custom"
            ? topicCalendarRange(topicCalendarDates(criteria.range))
            : relativeTopicTimeRange(Number(timeWindow)),
      });
    }
    function handleRangeChange(range: TopicTraceSelectorViewProps["range"]) {
      changeCriteria({ range });
    }
    function handleLimitChange(limit: string) {
      changeCriteria({ limit });
    }
    function handleSamplingChange(sampling: "random" | "latest") {
      changeCriteria({ sampling });
    }
    function handlePasteChange(paste: string) {
      changeCriteria({ paste });
    }
    function handlePreview() {
      const traces = [
        {
          id: "trace-support",
          name: "Support conversation",
          timestamp: new Date("2026-10-14T12:00:00Z"),
          environment: "production",
        },
        {
          id: "trace-checkout",
          name: "Checkout question",
          timestamp: new Date("2026-10-14T11:00:00Z"),
          environment: "production",
        },
      ].slice(0, Number(criteria.limit));
      setExcluded([]);
      setBatch({
        key,
        data: {
          traces,
          matchedTraceCount: 2,
          selectedTraceCount: traces.length,
        },
      });
    }
    const traceControls = (
      <TopicTraceSelectorView
        {...criteria}
        projectId="storybook"
        onModeChange={handleModeChange}
        filterMode={filterMode}
        onFilterModeChange={setFilterMode}
        onFilterChange={handleFilterChange}
        onTimeWindowChange={handleTimeWindowChange}
        onRangeChange={handleRangeChange}
        onLimitChange={handleLimitChange}
        onSamplingChange={handleSamplingChange}
        onPasteChange={handlePasteChange}
        pastedCount={pastedCount}
        pasteError={pasteError}
        preview={
          ready
            ? { status: "ready", data: ready.data, seed: ready.key }
            : { status: "idle" }
        }
        onPreview={handlePreview}
        excluded={excluded}
        onExcludedChange={setExcluded}
        builderColumns={observationEvalFilterColsWithOptions(
          {
            environment: [{ value: "production" }],
            name: [
              { value: "Support conversation" },
              { value: "Checkout question" },
            ],
          },
          [...eventsEvalFilterColumns],
        ).filter((column) => column.id !== "isRootObservation")}
        observed={undefined}
        onRequestColumns={undefined}
        erroredColumns={undefined}
      />
    );
    function handleOperationChange(
      operation: ManualTopicsDialogProps["operation"],
    ) {
      setDraft((current) => ({ ...current, operation }));
      args.onOperationChange(operation);
    }
    function handleToggleFacet(id: string, selected: boolean) {
      setDraft((current) => ({
        ...current,
        selectedFacetIds: selected
          ? current.selectedFacetIds.concat(id)
          : current.selectedFacetIds.filter((value) => value !== id),
      }));
      args.onToggleFacet(id, selected);
    }
    function handleReuseChange(reuse: boolean) {
      setDraft((current) => ({ ...current, reuse }));
      args.onReuseChange(reuse);
    }
    function handleSmallSampleChange(smallSample: boolean) {
      setDraft((current) => ({ ...current, smallSample }));
      args.onSmallSampleChange(smallSample);
    }
    function handleTimeRangeChange(
      generationTimeRange: ManualTopicsDialogProps["generationTimeRange"],
    ) {
      setDraft((current) => ({ ...current, generationTimeRange }));
      args.onGenerationTimeRangeChange(generationTimeRange);
    }
    return (
      <DialogController
        initialState={() => true}
        renderDialog={() => (
          <ManualTopicsDialog
            {...args}
            {...draft}
            traceControls={traceControls}
            count={count}
            canSubmit={args.canSubmit && selectionStatus.ready}
            disabledReason={
              args.isCountingSummaries
                ? null
                : (args.disabledReason ?? selectionStatus.disabledReason)
            }
            onOperationChange={handleOperationChange}
            onToggleFacet={handleToggleFacet}
            onReuseChange={handleReuseChange}
            onSmallSampleChange={handleSmallSampleChange}
            onGenerationTimeRangeChange={handleTimeRangeChange}
          />
        )}
      >
        {({ openDialog }) => {
          function handleOpen() {
            openDialog(true);
          }
          return <Button text="Open manual processing" onClick={handleOpen} />;
        }}
      </DialogController>
    );
  },
});

export default meta;

export const SummarizeTraces = meta.story({});
export const GenerateTopics = meta.story({ args: { operation: "update" } });
export const NoSummaries = meta.story({
  args: {
    operation: "update",
    facets: facets.map((facet) => ({ ...facet, summaries: 0 })),
    canSubmit: false,
  },
});
export const SubmissionError = meta.story({
  args: {
    error:
      "Could not start the run. Check your model connection and try again.",
  },
});

export const SkippedFacets = meta.story({
  name: "(Test) Warns about empty facets in an otherwise eligible run",
  args: {
    operation: "update",
    facets: facets.map((facet) => ({
      ...facet,
      summaries: facet.id === "outcome" ? 0 : facet.summaries,
    })),
  },
  play: async ({ canvasElement }) => {
    const view = within(
      within(canvasElement.ownerDocument.body).getByRole("dialog", {
        name: "Manual processing",
      }),
    );
    await expect(
      view.getByRole("button", { name: "Generate topics" }),
    ).toBeEnabled();
    await waitFor(() =>
      expect(
        view.getByText(/Outcome will be skipped: fewer than 100 summaries/),
      ).toBeVisible(),
    );
    await userEvent.click(view.getByRole("checkbox", { name: "Intent" }));
    await userEvent.click(view.getByRole("checkbox", { name: "Product area" }));
    await expect(
      view.getByRole("button", { name: "Generate topics" }),
    ).toBeDisabled();
    await expect(
      view.getByRole("button", { name: "Go to Summarize traces & embed" }),
    ).toBeVisible();
  },
});

export const InsufficientSummaries = meta.story({
  name: "(Test) Shows one readiness warning inside Review & Run",
  args: {
    operation: "update",
    facets: facets.map((facet) => ({ ...facet, summaries: 24 })),
  },
  play: async ({ canvasElement }) => {
    const view = within(
      within(canvasElement.ownerDocument.body).getByRole("dialog", {
        name: "Manual processing",
      }),
    );
    await expect(view.getAllByRole("alert")).toHaveLength(1);
    await expect(view.getByRole("alert")).toHaveTextContent(
      "Each selected facet has fewer than 100 summaries.",
    );
    await expect(
      view.getByRole("button", { name: "Generate topics" }),
    ).toBeDisabled();
    await userEvent.click(
      view.getByRole("button", { name: "Step 3: Review & Run" }),
    );
    await expect(view.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(
      view.getByRole("button", { name: "Step 3: Review & Run" }),
    );
    await userEvent.click(
      view.getByRole("switch", { name: "Small sample mode" }),
    );
    await expect(view.queryByRole("alert")).not.toBeInTheDocument();
    await expect(
      view.getByRole("button", { name: "Generate topics" }),
    ).toBeEnabled();
  },
});

export const ReviewChoices = meta.story({
  name: "(Test) Review choices across steps and operations",
  play: async ({ canvasElement, args }) => {
    const dialog = within(canvasElement.ownerDocument.body).getByRole(
      "dialog",
      { name: "Manual processing" },
    );
    const view = within(dialog);
    await userEvent.click(view.getByRole("checkbox", { name: "Intent" }));
    await expect(args.onToggleFacet).toHaveBeenCalledWith("intent", false);
    await waitFor(() =>
      expect(
        within(view.getByRole("group", { name: "Choose facets" })).getByText(
          "2 of 3 selected",
        ),
      ).toBeVisible(),
    );
    await userEvent.click(
      view.getByRole("button", { name: "Step 1: Choose facets" }),
    );
    await userEvent.click(
      view.getByRole("button", { name: "Step 1: Choose facets" }),
    );
    await expect(
      view.getByRole("checkbox", { name: "Intent" }),
    ).not.toBeChecked();
    await userEvent.click(
      view.getByRole("checkbox", {
        name: "Reuse existing summaries and embeddings",
      }),
    );
    await expect(args.onReuseChange).toHaveBeenCalledWith(false);
    await expect(
      view.getByText(/Fresh results incur model costs/),
    ).toBeVisible();
    await userEvent.click(view.getByRole("tab", { name: "Generate topics" }));
    await expect(args.onOperationChange).toHaveBeenCalledWith("update");
    await expect(
      view.queryByText(args.models.embedding.model),
    ).not.toBeInTheDocument();
    await expect(
      view.getByRole("checkbox", { name: "Intent" }),
    ).not.toBeChecked();
    await userEvent.click(
      view.getByRole("switch", { name: "Small sample mode" }),
    );
    await expect(args.onSmallSampleChange).toHaveBeenCalledWith(true);
    await expect(view.queryByText(/will be skipped/)).not.toBeInTheDocument();
    await userEvent.click(
      view.getByRole("tab", { name: "Summarize traces & embed" }),
    );
    await expect(
      view.getByRole("checkbox", {
        name: "Reuse existing summaries and embeddings",
      }),
    ).not.toBeChecked();
    await expect(view.getByText(args.models.embedding.model)).toBeVisible();
  },
});

export const UnknownSummaryCounts = meta.story({
  name: "(Test) Does not suggest reprocessing while summary counts are unknown",
  args: {
    operation: "update",
    facets: facets.map((facet) => ({ ...facet, summaries: null })),
    canSubmit: false,
    isCountingSummaries: true,
  },
  play: async ({ canvasElement }) => {
    const view = within(
      within(canvasElement.ownerDocument.body).getByRole("dialog", {
        name: "Manual processing",
      }),
    );
    await waitFor(() =>
      expect(view.getByRole("status")).toHaveTextContent(/^3 facets selected$/),
    );
    await expect(view.queryByRole("alert")).not.toBeInTheDocument();
    await expect(view.queryAllByText("No summaries")).toHaveLength(0);
    await expect(
      view.queryByRole("button", { name: "Go to Summarize traces & embed" }),
    ).not.toBeInTheDocument();
    await expect(
      view.getByRole("button", { name: "Generate topics" }),
    ).toBeDisabled();
  },
});

export const Submitting = meta.story({
  name: "(Test) Starting a run does not flash validation warnings",
  args: {
    operation: "update",
    isSubmitting: true,
    canSubmit: false,
    disabledReason: "A Topics run is in progress. Wait for it to finish.",
  },
  play: async ({ canvasElement }) => {
    const view = within(
      within(canvasElement.ownerDocument.body).getByRole("dialog", {
        name: "Manual processing",
      }),
    );
    await expect(view.queryByRole("alert")).not.toBeInTheDocument();
    await expect(
      view.getByRole("button", { name: "Generate topics" }),
    ).toBeDisabled();
  },
});

export const PreviewRequired = meta.story({
  name: "(Test) Preview gates summarizing, independently of topic generation",
  play: async ({ canvasElement, args }) => {
    const view = within(
      within(canvasElement.ownerDocument.body).getByRole("dialog", {
        name: "Manual processing",
      }),
    );
    const summarize = () =>
      view.getByRole("button", { name: "Summarize & embed" });
    await expect(summarize()).toBeDisabled();
    await waitFor(() =>
      expect(view.getByRole("button", { name: "Add filter" })).toBeVisible(),
    );
    await userEvent.click(view.getByRole("button", { name: "Add filter" }));
    await userEvent.click(
      within(view.getByRole("row")).getAllByRole("combobox")[0],
    );
    await userEvent.type(
      within(canvasElement.ownerDocument.body).getByPlaceholderText(
        "Search for column",
      ),
      "User",
    );
    await userEvent.keyboard("{Enter}");
    await userEvent.type(view.getByPlaceholderText("string"), "user-a");
    await userEvent.click(view.getByRole("tab", { name: "Query" }));
    await userEvent.click(view.getByRole("tab", { name: "Builder" }));
    await expect(view.getByPlaceholderText("string")).toHaveValue("user-a");
    await userEvent.click(view.getByRole("tab", { name: "Generate topics" }));
    await expect(
      view.getByRole("button", { name: "Generate topics" }),
    ).toBeEnabled();
    await userEvent.click(
      view.getByRole("tab", { name: "Summarize traces & embed" }),
    );
    await expect(summarize()).toBeDisabled();
    await userEvent.click(view.getByRole("button", { name: "Preview traces" }));
    await expect(
      view.getByRole("link", { name: "Support conversation" }),
    ).toBeVisible();
    await expect(summarize()).toBeEnabled();
    await userEvent.click(view.getByRole("button", { name: /Past 7 days/ }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByText("Past 30 days", {
        exact: true,
      }),
    );
    await expect(summarize()).toBeDisabled();
    await userEvent.click(view.getByRole("button", { name: "Preview traces" }));
    await expect(summarize()).toBeEnabled();
    await userEvent.click(
      view.getByRole("checkbox", { name: "Select trace trace-support" }),
    );
    await expect(view.getByText("Run 3 facets on 1 trace")).toBeVisible();
    const limit = view.getByRole("spinbutton", { name: "Maximum traces" });
    await userEvent.clear(limit);
    await userEvent.type(limit, "1");
    await expect(summarize()).toBeDisabled();
    await expect(
      view.queryByRole("link", { name: "Support conversation" }),
    ).not.toBeInTheDocument();
    await userEvent.click(view.getByRole("button", { name: "Preview traces" }));
    await expect(summarize()).toBeEnabled();
    await userEvent.click(summarize());
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
  },
});

export const PastedBatch = meta.story({
  name: "(Test) Pasted IDs select a unique batch without previewing filters",
  play: async ({ canvasElement, args }) => {
    const view = within(
      within(canvasElement.ownerDocument.body).getByRole("dialog", {
        name: "Manual processing",
      }),
    );
    await userEvent.click(view.getByRole("tab", { name: "Paste IDs" }));
    const submit = view.getByRole("button", { name: "Summarize & embed" });
    await expect(submit).toBeDisabled();
    await userEvent.type(
      view.getByRole("textbox", { name: "Trace IDs or links" }),
      "trace-a\ntrace-b\ntrace-a",
    );
    await expect(view.getByText("Run 3 facets on 2 traces")).toBeVisible();
    await expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
  },
});

export const MultiMonthSummaryRange = meta.story({
  name: "(Test) Selects trace summaries across multiple months",
  args: {
    operation: "update",
    generationTimeRange: {
      from: new Date(2025, 7, 1),
      to: new Date(2025, 7, 7),
    },
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      body.getByRole("dialog", { name: "Manual processing" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: /Aug/ }));
    await userEvent.click(body.getByText("Select from calendar"));
    await userEvent.click(await body.findByLabelText(/August 1st, 2025/));
    await userEvent.click(body.getByLabelText(/next month/i));
    await userEvent.click(body.getByLabelText(/September 15th, 2025/));
    await expect(args.onGenerationTimeRangeChange).toHaveBeenLastCalledWith({
      from: new Date(2025, 7, 1),
      to: new Date(2025, 8, 15, 23, 59, 59, 999),
    });
  },
});
