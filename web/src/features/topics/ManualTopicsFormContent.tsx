import { useForm } from "react-hook-form";
import { type TopicProcessInput } from "./TopicPipelineForm";
import { type TopicOperation } from "@langfuse/shared/topics";
import { type TimeRange } from "@/src/utils/date-range-utils";
import { useTopicTraceSelector } from "./TopicTraceSelector";
import { type RegenerateTopics } from "./useRegenerateTopics";
import { type ConfigureTopicsSettingsInput } from "./TopicModelSettings";
import { ManualTopicsDialog } from "./ManualTopicsDialog";

export function ManualTopicsFormContent({
  projectId,
  canWrite,
  generationTimeRange,
  onGenerationTimeRangeChange,
  settings,
  regenerate,
  running,
  processError,
  processPending,
  submitProcess,
  closeDialog,
  onTriggered,
  onConfigure,
}: ManualTopicsFormContentProps) {
  const form = useForm<ManualTopicsDraft>({
    defaultValues: {
      operation: "process",
      selectionIntent: null,
      reuse: true,
      smallSample: false,
    },
  });
  const { operation, selectionIntent, reuse, smallSample } = form.watch();
  const { selection, controls } = useTopicTraceSelector({
    projectId,
    enabled: operation === "process",
    filterOptionsEnabled: operation === "process",
  });
  const facets = regenerate.facets.map(({ facet, version, summaries }) => ({
    id: facet.id,
    name: facet.name,
    kind: facet.isBuiltIn ? "Built-in" : "Custom",
    version: version.version,
    description: facet.description || version.prompt,
    summaries,
  }));
  const selectedFacetIds = facets
    .filter(
      (facet) => selectionIntent === null || selectionIntent.includes(facet.id),
    )
    .map((facet) => facet.id);
  const selectedFacets = facets
    .filter((facet) => selectedFacetIds.includes(facet.id))
    .map((facet) => ({ facetId: facet.id, version: facet.version }));
  const configured = Boolean(
    settings?.stored.summary &&
    settings.stored.embedding &&
    settings.stored.clustering,
  );
  const disabledReason = (() => {
    if (!canWrite)
      return "You need permission to manage Topics in this project.";
    if (!settings) return "Loading Topics configuration…";
    if (!configured)
      return "Choose the Topics models in Configure Topics first.";
    if (settings.stored.blockedAt)
      return `Topics is paused. ${settings.stored.blockMessage ?? "Fix the model connection in Configure Topics."}`;
    if (!settings.stored.processingAvailable)
      return "Topics processing is not enabled for this project.";
    if (regenerate.prerequisiteReason) return regenerate.prerequisiteReason;
    if (running) return "A Topics run is in progress. Wait for it to finish.";
    if (selectedFacets.length === 0) return "Select at least one active facet.";
    if (operation === "update") {
      if (regenerate.disabledReason) return regenerate.disabledReason;
      if (
        !facets.some(
          (facet) => selectedFacetIds.includes(facet.id) && facet.summaries > 0,
        )
      )
        return "No summaries are available for the selected facets. Summarize traces first.";
      const minimum = smallSample ? 10 : 100;
      if (
        !facets.some(
          (facet) =>
            selectedFacetIds.includes(facet.id) && facet.summaries >= minimum,
        )
      )
        return smallSample
          ? "Each selected facet has fewer than 10 summaries. Summarize more traces or widen the time range."
          : "Each selected facet has fewer than 100 summaries. Enable small sample mode, summarize more traces, or widen the time range.";
    }
    return null;
  })();
  const isSubmitting = processPending || regenerate.isSubmitting;
  const canSubmit =
    !disabledReason &&
    !isSubmitting &&
    (operation === "update" || Boolean(selection?.count));
  const model = (slot: "summary" | "embedding" | "clustering") => {
    const value = settings?.stored[slot];
    return {
      model: value?.model ?? "Not configured",
      connection:
        settings?.connections.find(
          (connection) => connection.id === value?.llmApiKeyId,
        )?.provider ?? "Project connection",
    };
  };
  async function submit() {
    if (!canSubmit) return;
    const id = await (async () => {
      if (operation === "update")
        return regenerate.submit({
          facets: selectedFacets,
          exploratory: smallSample,
          minimumTraceCount: smallSample ? 10 : 100,
        });
      if (!selection) return null;
      return submitProcess({
        projectId,
        operation: "process",
        facets: selectedFacets,
        reuseExistingSummaries: reuse,
        ...("traceIds" in selection
          ? { traceIds: selection.traceIds }
          : { selection: selection.selection }),
      });
    })();
    if (id === null) return;
    closeDialog();
    onTriggered(id);
  }
  function handleOperationChange(value: TopicOperation) {
    form.setValue("operation", value);
  }
  function handleToggleFacet(id: string, selected: boolean) {
    form.setValue(
      "selectionIntent",
      selected
        ? [...selectedFacetIds, id]
        : selectedFacetIds.filter((value) => value !== id),
    );
  }
  function handleReuseChange(value: boolean) {
    form.setValue("reuse", value);
  }
  function handleSmallSampleChange(value: boolean) {
    form.setValue("smallSample", value);
  }
  function handleConfigure() {
    closeDialog();
    onConfigure();
  }
  return (
    <ManualTopicsDialog
      operation={operation}
      onOperationChange={handleOperationChange}
      facets={facets}
      selectedFacetIds={selectedFacetIds}
      onToggleFacet={handleToggleFacet}
      traceControls={controls}
      count={selection?.count ?? 0}
      generationTimeRange={generationTimeRange}
      onGenerationTimeRangeChange={onGenerationTimeRangeChange}
      models={{
        summary: model("summary"),
        embedding: model("embedding"),
        clustering: model("clustering"),
      }}
      reuse={reuse}
      onReuseChange={handleReuseChange}
      smallSample={smallSample}
      onSmallSampleChange={handleSmallSampleChange}
      canSubmit={canSubmit}
      isSubmitting={isSubmitting}
      disabledReason={disabledReason}
      error={operation === "process" ? processError : regenerate.error}
      onSubmit={submit}
      onConfigure={handleConfigure}
    />
  );
}

type ManualTopicsFormContentProps = {
  projectId: string;
  canWrite: boolean;
  generationTimeRange: TimeRange;
  onGenerationTimeRangeChange: (range: TimeRange) => void;
  settings: ConfigureTopicsSettingsInput | null;
  regenerate: RegenerateTopics;
  running: boolean;
  processError: string | null;
  processPending: boolean;
  submitProcess: (input: TopicProcessInput) => Promise<string | null>;
  closeDialog: () => void;
  onTriggered: (id: string) => void;
  onConfigure: () => void;
};

type ManualTopicsDraft = {
  operation: TopicOperation;
  selectionIntent: string[] | null;
  reuse: boolean;
  smallSample: boolean;
};
