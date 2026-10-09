import { Alert } from "@/src/components/design-system/Alert/Alert";
import { type ReactNode, useRef, useState } from "react";
import { skipToken } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { Input as NumericInput } from "@/src/components/ui/input";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { api } from "@/src/utils/api";
import {
  topicEmbeddingConfigSchema,
  topicMinimumTraceCountSchema,
  type TopicFacet,
  type TopicOperation,
  type TopicTimeRange,
} from "@langfuse/shared/topics";
import { useTopicTraceSelector } from "./TopicTraceSelector";

export function useTopicPipelineForm({
  projectId,
  facets,
  canWrite,
  onTriggered,
  facetEditor,
  timeRange,
}: {
  projectId: string;
  facets: TopicFacet[];
  canWrite: boolean;
  onTriggered: (id: string) => void;
  facetEditor: ReactNode;
  timeRange: TopicTimeRange | null;
}) {
  const [configurationOpen, setConfigurationOpen] = useState(false);
  function openConfiguration() {
    setConfigurationOpen(true);
  }
  function closeConfiguration() {
    setConfigurationOpen(false);
  }
  const [operation, setOperation] = useState<TopicOperation>("process");
  const [reuseExistingSummaries, setReuseExistingSummaries] = useState(false);
  const rules = api.topics.rules.useQuery(
    { projectId },
    { enabled: facets.length > 0 },
  );
  const [ruleId, setRuleId] = useState<string | null>(null);
  const selectedRule = rules.data?.find((rule) => rule.id === ruleId);
  const saveRuleLabel = selectedRule ? "Update rule" : "Save rule";
  const [ruleName, setRuleName] = useState("");
  const {
    selection,
    criteria,
    controls: traceControls,
    reset: resetTraceSelection,
  } = useTopicTraceSelector({
    projectId,
    enabled: facets.length > 0 && operation === "process",
    filterOptionsEnabled: configurationOpen,
    onOpenTrace: closeConfiguration,
  });
  const [selectedFacetIds, setSelectedFacetIds] = useState<string[]>(() =>
    facets
      .filter((facet) => facet.versions.length > 0)
      .map((facet) => facet.id),
  );
  const [facetVersions, setFacetVersions] = useState<Record<string, number>>(
    () =>
      Object.fromEntries(
        facets.map((facet) => [facet.id, facet.versions[0]?.version ?? 0]),
      ),
  );
  const [exploratory, setExploratory] = useState(false);
  const [minimumTraceCount, setMinimumTraceCount] = useState<string | null>(
    null,
  );
  const minimumTraceCountValue =
    minimumTraceCount ?? (exploratory ? "10" : "100");
  const minimumTraceCountResult = topicMinimumTraceCountSchema.safeParse(
    Number(minimumTraceCountValue),
  );
  const [dimensions, setDimensions] = useState(() =>
    String(topicEmbeddingConfigSchema.parse({}).embeddingDimensions),
  );
  const embeddingConfig = topicEmbeddingConfigSchema.safeParse({
    embeddingDimensions: Number(dimensions),
  });
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const trigger = api.topics.trigger.useMutation();
  const utils = api.useUtils();
  const saveRule = api.topics.saveRule.useMutation({
    onSuccess: (rule) => {
      utils.topics.rules.setData({ projectId }, (current) => [
        rule,
        ...(current ?? []).filter((item) => item.id !== rule.id),
      ]);
      setRuleId(rule.id);
      setRuleName(rule.name);
    },
  });
  const facetChoices = facets.flatMap((facet) => {
    const version =
      facet.versions.find(
        (version) => version.version === facetVersions[facet.id],
      ) ?? facet.versions[0];
    return version
      ? [{ facet, version, selected: selectedFacetIds.includes(facet.id) }]
      : [];
  });
  const selectedFacets = facetChoices
    .filter((choice) => choice.selected)
    .map((choice) => ({
      facetId: choice.facet.id,
      version: choice.version.version,
    }));
  const activeFacetIds = selectedFacets.map(({ facetId }) => facetId);
  const matchesRule =
    selectedRule &&
    criteria &&
    JSON.stringify(criteria) === JSON.stringify(selectedRule.filter) &&
    activeFacetIds.length === selectedRule.facetIds.length &&
    activeFacetIds.every((id) => selectedRule.facetIds.includes(id));
  const summaryCounts = api.topics.summaryCounts.useQuery(
    timeRange
      ? {
          projectId,
          facets: selectedFacets,
          timeRange,
          embeddingConfig:
            embeddingConfig.data ?? topicEmbeddingConfigSchema.parse({}),
        }
      : skipToken,
    {
      enabled:
        operation === "update" &&
        timeRange !== null &&
        embeddingConfig.success &&
        selectedFacets.length > 0,
    },
  );
  const summaryCount = (facetId: string, version: number) =>
    summaryCounts.data?.find(
      (count) => count.facetId === facetId && count.facetVersion === version,
    )?.count ?? 0;
  const hasStoredSummaries = selectedFacets.some(
    ({ facetId, version }) => summaryCount(facetId, version) > 0,
  );
  const compatibleSummaryLabel = (facetId: string, version: number) => {
    if (summaryCounts.isFetching) return "Counting stored summaries…";
    if (summaryCounts.error) return "Could not count stored summaries.";
    return `${summaryCount(facetId, version).toLocaleString()} compatible summaries ready`;
  };
  const toggleFacet = (id: string, checked: boolean) =>
    setSelectedFacetIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
  async function submit() {
    setError(null);
    try {
      if (selectedFacets.length === 0)
        throw new Error("Select at least one facet.");
      const base = {
        projectId,
        facets: selectedFacets,
        embeddingConfig: topicEmbeddingConfigSchema.parse({
          embeddingDimensions: Number(dimensions),
        }),
      };
      const values = (() => {
        if (operation === "update") {
          if (!timeRange)
            throw new Error("Select a time range of at most 90 days.");
          return {
            ...base,
            operation,
            exploratory,
            timeRange,
            minimumTraceCount: topicMinimumTraceCountSchema.parse(
              Number(minimumTraceCountValue),
            ),
          };
        }
        if (!selection?.count)
          throw new Error("Preview and select traces before processing.");
        const traceInput =
          "traceIds" in selection
            ? { traceIds: selection.traceIds }
            : { selection: selection.selection };
        return {
          ...base,
          operation,
          reuseExistingSummaries,
          ...traceInput,
          ...(selectedRule && matchesRule ? { ruleId: selectedRule.id } : {}),
        };
      })();
      const key = JSON.stringify(values);
      if (request.current?.key !== key)
        request.current = { key, id: crypto.randomUUID() };
      const result = await trigger.mutateAsync({
        ...values,
        requestId: request.current.id,
      });
      request.current = null;
      setConfigurationOpen(false);
      onTriggered(result.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not trigger the pipeline.",
      );
    }
  }
  const operationControls = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-64 max-w-full">
          <SelectInput
            aria-label="Pipeline operation"
            placeholder="Pipeline operation"
            options={[
              { value: "process", label: "Process traces" },
              { value: "update", label: "Update topics" },
            ]}
            value={operation}
            onValueChange={(value) => {
              setOperation(value as TopicOperation);
              resetTraceSelection(selectedRule?.filter);
              setError(null);
              if (value === "update")
                utils.topics.summaryCounts.invalidate({ projectId });
            }}
          />
        </div>
      </div>
      {operation === "process" && (
        <label className="flex flex-col gap-1 text-sm">
          Saved configuration
          <Select
            value={selectedRule?.id ?? "adhoc"}
            disabled={rules.isLoading || saveRule.isPending}
            onValueChange={(value) => {
              const rule = rules.data?.find((item) => item.id === value);
              setRuleId(rule?.id ?? null);
              setRuleName(rule?.name ?? "");
              setSelectedFacetIds(
                rule?.facetIds ??
                  facets
                    .filter((facet) => facet.versions.length > 0)
                    .map((facet) => facet.id),
              );
              setFacetVersions(
                Object.fromEntries(
                  facets.map((facet) => [
                    facet.id,
                    facet.versions[0]?.version ?? 0,
                  ]),
                ),
              );
              resetTraceSelection(rule?.filter);
              saveRule.reset();
            }}
          >
            <SelectTrigger className="w-64" aria-label="Saved configuration">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="ph-no-capture">
              <SelectItem value="adhoc">Custom configuration</SelectItem>
              {rules.data?.map((rule) => (
                <SelectItem key={rule.id} value={rule.id}>
                  {rule.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rules.error && (
            <span role="alert" className="text-destructive text-sm">
              Could not load saved rules. Custom configuration is still
              available.
            </span>
          )}
        </label>
      )}
    </>
  );
  let actionLabel = "Update topics";
  if (operation === "process")
    actionLabel = selection?.count
      ? `Process ${selection.count.toLocaleString()} traces`
      : "Process traces";
  const triggerAction = {
    label: trigger.isPending ? "Starting…" : actionLabel,
    disabled:
      !canWrite ||
      !embeddingConfig.success ||
      (operation === "update" &&
        (!timeRange || !minimumTraceCountResult.success)) ||
      trigger.isPending ||
      selectedFacets.length === 0 ||
      (operation === "update"
        ? summaryCounts.isFetching ||
          !!summaryCounts.error ||
          !hasStoredSummaries
        : !selection?.count),
    onSelect: submit,
  };
  const primaryAction = (
    <Button
      text={triggerAction.label}
      size="sm"
      disabled={triggerAction.disabled}
      onClick={triggerAction.onSelect}
    />
  );
  const configuration = (
    <DialogPrimitive.Root
      open={configurationOpen}
      onOpenChange={setConfigurationOpen}
    >
      <Dialog title="Configure topics" size="xxl" closeOnInteractionOutside>
        <Dialog.Body>
          <div className="ph-no-capture flex flex-col gap-6">
            <p className="text-muted-foreground">
              {operation === "process"
                ? "Summarize and embed selected traces, then assign them to current topics."
                : "Rebuild topics from stored summaries and embeddings in the selected Topics time range."}
            </p>
            {operationControls}
            {operation === "process" && traceControls}
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-bold">Facets</legend>
              {facetChoices.map(({ facet, version, selected }) => (
                <div
                  key={facet.id}
                  className="bg-muted/30 flex flex-col gap-2 rounded-md p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex min-w-0 items-center gap-2 text-sm font-bold">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(value) =>
                          toggleFacet(facet.id, value === true)
                        }
                      />
                      {facet.name}
                    </label>
                    <div className="w-24">
                      <SelectInput
                        aria-label={`Version for ${facet.name}`}
                        placeholder="Version"
                        value={String(version.version)}
                        options={facet.versions.map((candidate) => ({
                          value: String(candidate.version),
                          label: `v${candidate.version}`,
                        }))}
                        onValueChange={(value) =>
                          setFacetVersions((current) => ({
                            ...current,
                            [facet.id]: Number(value),
                          }))
                        }
                      />
                    </div>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {version.prompt}
                  </p>
                  {operation === "update" && selected && (
                    <p className="text-muted-foreground text-sm">
                      {compatibleSummaryLabel(facet.id, version.version)}
                    </p>
                  )}
                </div>
              ))}
            </fieldset>
            {operation === "process" && criteria && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex w-64 max-w-full flex-col gap-1 text-sm">
                    Rule name
                    <Input
                      aria-label="Saved configuration name"
                      placeholder="Save these filters and facets"
                      value={ruleName}
                      onChange={(event) => setRuleName(event.target.value)}
                    />
                  </label>
                  <Button
                    text={saveRule.isPending ? "Saving…" : saveRuleLabel}
                    type="button"
                    variant="secondary"
                    disabled={
                      !canWrite ||
                      !ruleName.trim() ||
                      activeFacetIds.length === 0 ||
                      saveRule.isPending
                    }
                    onClick={() =>
                      saveRule.mutate({
                        projectId,
                        ...(selectedRule ? { id: selectedRule.id } : {}),
                        name: ruleName,
                        filter: criteria,
                        facetIds: activeFacetIds,
                      })
                    }
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  Rules save filters and selected facets. Choose the time range,
                  sampling and summary reuse for each run.
                  {selectedRule && !matchesRule
                    ? " Unsaved changes apply only to this run until you update the rule."
                    : ""}
                </p>
                {saveRule.error && (
                  <Alert variant="destructive" size="sm">
                    <Alert.Description>
                      <p className="break-words">{saveRule.error.message}</p>
                    </Alert.Description>
                  </Alert>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-5">
              {operation === "update" && (
                <label className="flex flex-col gap-1 text-sm">
                  Minimum traces for clustering
                  <NumericInput
                    aria-label="Minimum traces for clustering"
                    aria-invalid={!minimumTraceCountResult.success}
                    className="w-28"
                    type="number"
                    min={3}
                    step={1}
                    value={minimumTraceCountValue}
                    onChange={(event) =>
                      setMinimumTraceCount(event.target.value)
                    }
                  />
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm">
                Embedding dimensions
                <SelectInput
                  aria-label="Embedding dimensions"
                  placeholder="Embedding dimensions"
                  value={dimensions}
                  onValueChange={setDimensions}
                  options={[256, 512, 1024, 1536].map((value) => ({
                    value: String(value),
                    label: String(value),
                  }))}
                />
              </label>
              {operation === "update" && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={exploratory}
                    onCheckedChange={(value) => setExploratory(value === true)}
                  />
                  Small sample mode (smaller, provisional topics)
                </label>
              )}
            </div>
            {operation === "process" && (
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={reuseExistingSummaries}
                    onCheckedChange={(value) =>
                      setReuseExistingSummaries(value === true)
                    }
                  />
                  Reuse stored summaries
                </label>
                <p className="text-muted-foreground text-xs">
                  Reuse saved summaries and embeddings for each trace and facet
                  version. Source changes are not checked. Leave unchecked to
                  generate fresh results.
                </p>
              </div>
            )}
            {operation === "process" && selection?.count ? (
              <p className="text-muted-foreground text-sm">
                Process {selection.count.toLocaleString()} traces across{" "}
                {selectedFacets.length} facets.{" "}
                {reuseExistingSummaries
                  ? "Matching stored summaries and embeddings are reused. Missing summaries use OpenAI; embeddings use Cohere on Amazon Bedrock."
                  : "Generate fresh summaries with OpenAI and embeddings with Cohere on Amazon Bedrock."}
              </p>
            ) : null}
            {operation === "process" && (
              <p className="text-muted-foreground text-xs">
                New summaries are assigned to the latest compatible topics. If
                no topics exist yet, summaries wait until you run Update topics.
              </p>
            )}
            {operation === "update" && summaryCounts.error && (
              <Alert variant="destructive" size="sm">
                <Alert.Description>
                  <p className="break-words">{summaryCounts.error.message}</p>
                </Alert.Description>
              </Alert>
            )}
            {operation === "update" && (
              <p className="text-muted-foreground text-xs">
                {minimumTraceCountResult.success
                  ? `Clustering starts with at least ${minimumTraceCountResult.data.toLocaleString()} compatible stored summaries per facet. Below this minimum, process more traces first.`
                  : "Enter a whole number of at least 3 traces."}{" "}
                Small sample mode lowers the minimum topic size from 15 to 3
                traces.
              </p>
            )}
            {facetEditor}
          </div>
        </Dialog.Body>
        <div className="flex shrink-0 justify-end p-4">
          <Button
            text="Done"
            variant="secondary"
            onClick={closeConfiguration}
          />
        </div>
      </Dialog>
    </DialogPrimitive.Root>
  );
  return {
    primaryAction: facets.length > 0 ? primaryAction : null,
    triggerAction: facets.length > 0 ? triggerAction : null,
    openConfiguration,
    error: facets.length > 0 ? error : null,
    configuration: facets.length > 0 ? configuration : null,
  };
}
