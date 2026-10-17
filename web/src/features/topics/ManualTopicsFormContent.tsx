import { useState } from "react";
import { useForm } from "react-hook-form";
import { skipToken } from "@tanstack/react-query";
import { api } from "@/src/utils/api";
import { type TopicProcessInput } from "./TopicPipelineForm";
import { type TopicOperation } from "@langfuse/shared/topics";
import { type TimeRange } from "@/src/utils/date-range-utils";
import { useTopicTraceSelector } from "./TopicTraceSelector";
import { type RegenerateTopics } from "./useRegenerateTopics";
import { type ConfigureTopicsSettingsInput } from "./TopicModelSettings";
import { ManualTopicsDialog } from "./ManualTopicsDialog";
import { manualTopicsSelection } from "./manual-topics-selection";

export function ManualTopicsFormContent({
  initialOperation = "process",
  projectId,
  canWrite,
  generationTimeRange,
  onGenerationTimeRangeChange,
  settings,
  configurationError,
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
      operation: initialOperation,
      selectionIntent: null,
      reuse: true,
      smallSample: false,
    },
  });
  const { operation, selectionIntent, reuse, smallSample } = form.watch();
  const [submitted, setSubmitted] = useState(false);
  const isSubmitting = processPending || regenerate.isSubmitting || submitted;
  const { selection, controls } = useTopicTraceSelector({
    projectId,
    enabled: operation === "process",
    filterOptionsEnabled: operation === "process",
  });
  const summaryCounts = api.topics.summaryCounts.useQuery(
    operation === "update" &&
      (!regenerate.disabledReason || isSubmitting) &&
      regenerate.timeRange
      ? {
          projectId,
          facets: regenerate.facets.map(({ facet, version }) => ({
            facetId: facet.id,
            version: version.version,
          })),
          timeRange: regenerate.timeRange,
        }
      : skipToken,
  );
  const availableCounts =
    summaryCounts.data && !summaryCounts.error ? summaryCounts.data : null;
  const facets = regenerate.facets.map(({ facet, version }) => {
    let summaries: number | null = null;
    if (availableCounts) {
      summaries =
        availableCounts.find(
          (count) =>
            count.facetId === facet.id &&
            count.facetVersion === version.version,
        )?.count ?? 0;
    }
    return {
      id: facet.id,
      name: facet.name,
      kind: facet.isBuiltIn ? "Built-in" : "Custom",
      version: version.version,
      description: facet.description || version.prompt,
      summaries,
    };
  });
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
  const selectionStatus = manualTopicsSelection({
    operation,
    summaryCounts: facets
      .filter((facet) => selectedFacetIds.includes(facet.id))
      .map((facet) => facet.summaries ?? 0),
    traceCount: selection?.count ?? 0,
    smallSample,
  });
  const isCountingSummaries =
    operation === "update" &&
    !regenerate.disabledReason &&
    (summaryCounts.isPending || summaryCounts.isFetching);
  const disabledReason = (() => {
    if (isSubmitting) return null;
    if (!canWrite)
      return "You need permission to manage Topics in this project.";
    if (configurationError) return configurationError;
    if (regenerate.prerequisiteReason) return regenerate.prerequisiteReason;
    if (!settings) return "Loading Topics configuration…";
    if (!configured)
      return "Choose the Topics models in Configure Topics first.";
    if (settings.stored.blockedAt)
      return `Topics is paused. ${settings.stored.blockMessage ?? "Fix the model connection in Configure Topics."}`;
    if (!settings.stored.processingAvailable)
      return "Topics processing is not enabled for this project.";
    if (running) return "A Topics run is in progress. Wait for it to finish.";
    if (operation === "update" && regenerate.disabledReason)
      return regenerate.disabledReason;
    if (operation === "update") {
      if (isCountingSummaries) return null;
      if (summaryCounts.error)
        return `Could not count stored summaries: ${summaryCounts.error.message}`;
      if (!facets.some((facet) => (facet.summaries ?? 0) > 0))
        return "No trace summaries in the selected time range yet. Summarize traces first, then regenerate.";
    }
    return selectionStatus.disabledReason;
  })();
  const canSubmit =
    !disabledReason &&
    !isSubmitting &&
    !isCountingSummaries &&
    selectionStatus.ready;
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
    setSubmitted(true);
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
      isCountingSummaries={isCountingSummaries}
      disabledReason={disabledReason}
      error={operation === "process" ? processError : regenerate.error}
      onSubmit={submit}
      onConfigure={handleConfigure}
    />
  );
}

type ManualTopicsFormContentProps = {
  initialOperation?: TopicOperation;
  projectId: string;
  canWrite: boolean;
  generationTimeRange: TimeRange;
  onGenerationTimeRangeChange: (range: TimeRange) => void;
  settings: ConfigureTopicsSettingsInput | null;
  configurationError: string | null;
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
