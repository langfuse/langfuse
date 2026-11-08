import { type ReactNode } from "react";
import { Info } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { type TopicOperation } from "@langfuse/shared/topics";
import { type TimeRange } from "@/src/utils/date-range-utils";
import { TimeRangePicker } from "@/src/components/date-picker";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";

export function ManualTopicsDialog({
  operation,
  onOperationChange,
  facets,
  selectedFacetIds,
  onToggleFacet,
  traceControls,
  count,
  generationTimeRange,
  onGenerationTimeRangeChange,
  models,
  reuse,
  onReuseChange,
  smallSample,
  onSmallSampleChange,
  canSubmit,
  isSubmitting,
  isCountingSummaries = false,
  disabledReason,
  error,
  onSubmit,
  onConfigure,
}: ManualTopicsDialogProps) {
  const minimum = smallSample ? 10 : 100;
  const selectedUpdates = facets.filter((facet) =>
    selectedFacetIds.includes(facet.id),
  );
  const noSummaries =
    selectedUpdates.length > 0 &&
    selectedUpdates.every((facet) => facet.summaries === 0);
  const belowMinimum = selectedUpdates.filter(
    (facet) => facet.summaries !== null && facet.summaries < minimum,
  );
  const facetLabel = selectedUpdates.length === 1 ? "facet" : "facets";
  const traceLabel = count === 1 ? "trace" : "traces";
  const processingSummary =
    count > 0 ? (
      `Run ${selectedUpdates.length} ${facetLabel} on ${count.toLocaleString()} ${traceLabel}`
    ) : (
      <>
        Press <em>Preview traces</em> first, then confirm or adjust the batch
        before starting the run.
      </>
    );
  const storedSummaryCount = selectedUpdates.every(
    (facet) => facet.summaries !== null,
  )
    ? selectedUpdates.reduce(
        (total, facet) => total + (facet.summaries ?? 0),
        0,
      )
    : null;
  const generationSummary = (
    <>
      {selectedUpdates.length} {facetLabel} selected
      {storedSummaryCount !== null ? (
        <> · {storedSummaryCount.toLocaleString()} stored summaries</>
      ) : null}
    </>
  );
  function handleOperationChange(value: string) {
    onOperationChange(value as TopicOperation);
  }
  function handleReuseChange(value: boolean | "indeterminate") {
    onReuseChange(value === true);
  }
  function handleChooseSummarization() {
    onOperationChange("process");
  }
  return (
    <Dialog
      title="Manual processing"
      size="lg"
      actions={[
        {
          label:
            operation === "process" ? "Summarize & embed" : "Generate topics",
          disabled: !canSubmit,
          loading: isSubmitting,
          onClick: onSubmit,
        },
      ]}
    >
      <Dialog.Body>
        <div className="ph-no-capture flex flex-col gap-5 text-sm">
          <Tabs value={operation} onValueChange={handleOperationChange}>
            <Tabs.List
              variant="inset"
              size="md"
              layout="full"
              aria-label="Manual processing operation"
            >
              <Tabs.Trigger value="process" label="Summarize traces & embed" />
              <Tabs.Trigger value="update" label="Generate topics" />
            </Tabs.List>
          </Tabs>
          <p className="text-muted-foreground">
            {operation === "process"
              ? "Prepare historical or unprocessed traces for topic discovery. New summaries are assigned to existing compatible topics; generate topics afterward to discover new groups."
              : "Generate topics from stored summaries and embeddings for the selected facets."}
          </p>
          <div className="flex flex-col">
            <Stepper
              number={1}
              title="Choose facets"
              description={
                operation === "process"
                  ? "Choose the facets to summarize and embed your traces for."
                  : "Facets to run clustering and generate topics for."
              }
            >
              <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="sr-only">Choose facets</legend>
                <div className="flex flex-wrap gap-2">
                  {facets.map((facet) => (
                    <FacetToggle
                      key={facet.id}
                      facet={facet}
                      selected={selectedFacetIds.includes(facet.id)}
                      operation={operation}
                      onToggleFacet={onToggleFacet}
                    />
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">
                  {selectedUpdates.length} of {facets.length} selected
                </p>
              </fieldset>
            </Stepper>
            <Stepper
              number={2}
              title={
                operation === "process"
                  ? "Select traces"
                  : "Select trace summaries"
              }
              description={
                operation === "process"
                  ? "Set your filters or paste trace IDs. Preview matching traces and choose the batch to run. Previewing does not use a model."
                  : "Use stored summaries of traces that started within this time range for clustering and topic generation."
              }
            >
              <section hidden={operation !== "process"}>
                <div className="flex flex-col gap-4">{traceControls}</div>
              </section>
              {operation === "update" ? (
                <section className="self-start">
                  <TimeRangePicker
                    timeRange={generationTimeRange}
                    onTimeRangeChange={onGenerationTimeRangeChange}
                    timeRangePresets={[
                      "last1Day",
                      "last7Days",
                      "last30Days",
                      "last90Days",
                    ]}
                    maxRangeMs={90 * 86_400_000}
                    className="my-0"
                  />
                </section>
              ) : null}
            </Stepper>
            <Stepper number={3} title="Review & Run">
              <p role="status" className="ph-no-capture text-muted-foreground">
                {operation === "process"
                  ? processingSummary
                  : generationSummary}
              </p>
              {operation === "process" ? (
                <p>
                  Summarize and embed the selected traces, then assign them to
                  existing topics.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-bold">Models</span>
                <dl className="flex flex-wrap gap-x-4 gap-y-2">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <dt className="text-muted-foreground">
                      {operation === "process" ? "Summary:" : "Topic naming:"}
                    </dt>
                    <dd
                      title={
                        operation === "process"
                          ? models.summary.connection
                          : models.clustering.connection
                      }
                    >
                      {operation === "process"
                        ? models.summary.model
                        : models.clustering.model}
                    </dd>
                  </div>
                  {operation === "process" ? (
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      <dt className="text-muted-foreground">Embedding:</dt>
                      <dd title={models.embedding.connection}>
                        {models.embedding.model}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className="ml-auto">
                  <Button
                    text="Configure Topics"
                    variant="ghost"
                    size="sm"
                    onClick={onConfigure}
                  />
                </div>
              </div>
              {operation === "process" ? (
                <>
                  <div className="flex items-center gap-1 p-1">
                    <label className="flex items-center gap-2">
                      <Checkbox
                        aria-label="Reuse existing summaries and embeddings"
                        checked={reuse}
                        onCheckedChange={handleReuseChange}
                      />
                      Reuse existing summaries &amp; embeddings
                    </label>
                    <Tooltip label="Reuse compatible results for the same facet version and models. Source changes are not checked. Turn off to generate fresh results.">
                      {({ getTriggerProps }) => (
                        <IconButton
                          {...getTriggerProps()}
                          icon={Info}
                          label="About reusing summaries and embeddings"
                          size="sm"
                        />
                      )}
                    </Tooltip>
                  </div>
                  <p>
                    <span className="font-bold">Model costs: </span>
                    <span className="text-muted-foreground">
                      {reuse
                        ? "Only missing or incompatible results incur costs on your linked API keys."
                        : "Fresh results incur model costs for every selected trace and facet on your linked API keys."}
                    </span>
                  </p>
                </>
              ) : null}
              {operation === "update" ? (
                <>
                  <p className="text-muted-foreground text-xs">
                    Topic naming uses your configured model and incurs model
                    costs. New groups replace your current topics once the run
                    succeeds.
                  </p>
                  <label className="flex items-start justify-between gap-4 rounded-md border p-3">
                    <span className="flex flex-col gap-1">
                      <span className="font-bold">Small sample mode</span>
                      <span className="text-muted-foreground text-xs">
                        Explore provisional topics with at least 10 summaries
                        per facet instead of 100.
                      </span>
                    </span>
                    <Switch
                      aria-label="Small sample mode"
                      checked={smallSample}
                      onCheckedChange={onSmallSampleChange}
                    />
                  </label>
                  {!isSubmitting &&
                  !isCountingSummaries &&
                  !disabledReason &&
                  !noSummaries &&
                  belowMinimum.length > 0 ? (
                    <Alert variant="warning" size="sm">
                      <Alert.Description>
                        <p>
                          {belowMinimum.map((facet) => facet.name).join(", ")}{" "}
                          will be skipped: fewer than {minimum} summaries.
                          Summarize more traces, widen the time range, or enable
                          small sample mode.
                        </p>
                      </Alert.Description>
                    </Alert>
                  ) : null}
                </>
              ) : null}
              {!isSubmitting && disabledReason ? (
                <Alert variant="warning" size="sm">
                  <Alert.Description>
                    <div className="flex flex-col items-start gap-2">
                      <p>{disabledReason}</p>
                      {operation === "update" && noSummaries ? (
                        <Button
                          text="Go to Summarize traces & embed"
                          variant="secondary"
                          size="sm"
                          onClick={handleChooseSummarization}
                        />
                      ) : null}
                    </div>
                  </Alert.Description>
                </Alert>
              ) : null}
              {error ? (
                <Alert variant="destructive" size="sm">
                  <Alert.Description>
                    <p>{error}</p>
                  </Alert.Description>
                </Alert>
              ) : null}
            </Stepper>
          </div>
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

function FacetToggle({
  facet,
  selected,
  operation,
  onToggleFacet,
}: FacetToggleProps) {
  function handleCheckedChange(checked: boolean | "indeterminate") {
    onToggleFacet(facet.id, checked === true);
  }
  return (
    <label
      title={`${facet.description} (${facet.kind}, v${facet.version})`}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-2 transition-colors",
        selected
          ? "border-border-contrast bg-secondary"
          : "border-input text-muted-foreground hover:bg-accent",
      )}
    >
      <Checkbox
        aria-label={facet.name}
        checked={selected}
        onCheckedChange={handleCheckedChange}
      />
      <span className="self-baseline font-bold">{facet.name}</span>
      {operation === "update" ? (
        <span
          className="text-muted-foreground w-25 shrink-0 self-baseline truncate text-right text-xs tabular-nums"
          title={
            facet.summaries === null
              ? undefined
              : `${facet.summaries.toLocaleString()} summaries`
          }
        >
          {summaryLabel(facet.summaries)}
        </span>
      ) : null}
    </label>
  );
}

function summaryLabel(summaries: number | null) {
  if (summaries === null) return "Not counted";
  if (summaries === 0) return "No summaries";
  const count =
    summaries > 1_000
      ? compactNumberFormatter(
          summaries,
          summaries < 10_000 ? 1 : 0,
        ).toLowerCase()
      : summaries.toLocaleString();
  return `${count} summaries`;
}

type Model = { model: string; connection: string };
export type ManualTopicsDialogProps = {
  operation: TopicOperation;
  onOperationChange: (operation: TopicOperation) => void;
  facets: {
    id: string;
    name: string;
    summaries: number | null;
    kind: string;
    version: number;
    description: string;
  }[];
  selectedFacetIds: string[];
  onToggleFacet: (id: string, selected: boolean) => void;
  traceControls: ReactNode;
  count: number;
  generationTimeRange: TimeRange;
  onGenerationTimeRangeChange: (range: TimeRange) => void;
  models: { summary: Model; embedding: Model; clustering: Model };
  reuse: boolean;
  onReuseChange: (reuse: boolean) => void;
  smallSample: boolean;
  onSmallSampleChange: (value: boolean) => void;
  canSubmit: boolean;
  isSubmitting: boolean;
  isCountingSummaries?: boolean;
  disabledReason: string | null;
  error: string | null;
  onSubmit: () => void;
  onConfigure: () => void;
};

type FacetToggleProps = Pick<
  ManualTopicsDialogProps,
  "operation" | "onToggleFacet"
> & {
  facet: ManualTopicsDialogProps["facets"][number];
  selected: boolean;
};
