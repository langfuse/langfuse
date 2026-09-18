import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  topicEmbeddingConfigSchema,
  topicMinimumTraceCountSchema,
  type TopicFacet,
  type TopicOperation,
} from "@langfuse/shared/topics";
import {
  TopicTraceSelector,
  type TopicTraceCriteria,
  type TopicTraceSelection,
} from "./TopicTraceSelector";

type Run = RouterOutputs["topics"]["runs"][number];
type Execution = RouterOutputs["topics"]["execution"];

export function TopicPipelineForm({
  projectId,
  facets,
  runs,
  executions,
  canWrite,
  onTriggered,
  facetEditor,
  render,
}: {
  projectId: string;
  facets: TopicFacet[];
  runs: Run[];
  executions: Execution[];
  canWrite: boolean;
  onTriggered: (id: string) => void;
  facetEditor: ReactNode;
  render: (actions: ReactNode, configuration: ReactNode) => ReactNode;
}) {
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [operation, setOperation] = useState<TopicOperation>("refresh");
  const rules = api.topics.rules.useQuery({ projectId });
  const [ruleId, setRuleId] = useState<string | null>(null);
  const selectedRule = rules.data?.find((rule) => rule.id === ruleId);
  const [ruleName, setRuleName] = useState("");
  const [selector, setSelector] = useState<{
    key: number;
    initialCriteria?: TopicTraceCriteria;
  }>({ key: 0 });
  const [selectedFacetIds, setSelectedFacetIds] = useState<string[]>(() =>
    facets
      .filter((facet) => facet.versions.length > 0)
      .map((facet) => facet.id),
  );
  const [facetVersions, setFacetVersions] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        facets.map((facet) => [facet.id, facet.versions[0]?.id ?? ""]),
      ),
  );
  const [targetRunIds, setTargetRunIds] = useState<Record<string, string>>({});
  const [sourceExecutionIds, setSourceExecutionIds] = useState<string[]>([]);
  const [exploratory, setExploratory] = useState(false);
  const [minimumTraceCount, setMinimumTraceCount] = useState<string | null>(
    null,
  );
  const minimumTraceCountValue =
    minimumTraceCount ?? (exploratory ? "10" : "100");
  const minimumTraceCountResult = topicMinimumTraceCountSchema.safeParse(
    Number(minimumTraceCountValue),
  );
  const [dimensions, setDimensions] = useState("768");
  const [forceRefresh, setForceRefresh] = useState(false);
  const embeddingConfig = topicEmbeddingConfigSchema.safeParse({
    embeddingDimensions: Number(dimensions),
  });
  const currentResults = api.topics.currentResults.useQuery({ projectId });
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
        (version) => version.id === facetVersions[facet.id],
      ) ?? facet.versions[0];
    return version
      ? [{ facet, version, selected: selectedFacetIds.includes(facet.id) }]
      : [];
  });
  const facetVersionIds = facetChoices
    .filter((choice) => choice.selected)
    .map((choice) => choice.version.id);
  const activeFacetIds = facetChoices
    .filter((choice) => choice.selected)
    .map((choice) => choice.facet.id);
  const matchesRule = (criteria: TopicTraceCriteria | null) =>
    selectedRule &&
    criteria &&
    JSON.stringify(criteria.filter) === JSON.stringify(selectedRule.filter) &&
    criteria.sampling === selectedRule.sampling &&
    criteria.limit === selectedRule.limit &&
    activeFacetIds.length === selectedRule.facetIds.length &&
    activeFacetIds.every((id) => selectedRule.facetIds.includes(id));
  const retainedCohort =
    currentResults.data &&
    facetVersionIds.every((id) =>
      currentResults.data.some((facet) => facet.facetVersionId === id),
    )
      ? new Set(
          currentResults.data
            .filter((facet) =>
              facetVersionIds.includes(facet.facetVersionId ?? ""),
            )
            .flatMap((facet) => facet.retainedTraceIds),
        )
      : null;
  const compatibleRuns = runs.filter(
    (run) =>
      run.publishedAt &&
      run.embeddingConfig?.embeddingDimensions === Number(dimensions) &&
      run.embeddingConfig.embeddingModel ===
        embeddingConfig.data?.embeddingModel,
  );
  const selectedTargetRunIds = Object.fromEntries(
    facetVersionIds.flatMap((id) =>
      compatibleRuns.some(
        (run) => run.facetVersionId === id && run.id === targetRunIds[id],
      )
        ? [[id, targetRunIds[id]!]]
        : [],
    ),
  );
  const reclusterSources = executions.filter(
    (execution) =>
      ["completed", "completed_with_errors"].includes(execution.status) &&
      facetVersionIds.every((id) =>
        execution.facets.some((facet) => facet.facetVersionId === id),
      ),
  );
  const selectedSourceIds = sourceExecutionIds.filter((id) =>
    reclusterSources.some((execution) => execution.id === id),
  );
  const toggleFacet = (id: string, checked: boolean) =>
    setSelectedFacetIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
  async function submit(
    selection: TopicTraceSelection | null,
    criteria: TopicTraceCriteria | null,
  ) {
    setError(null);
    try {
      if (!facetVersionIds.length)
        throw new Error("Select at least one facet.");
      const base = {
        projectId,
        facetVersionIds,
        exploratory,
        ...(operation !== "assign" && {
          minimumTraceCount: topicMinimumTraceCountSchema.parse(
            Number(minimumTraceCountValue),
          ),
        }),
        forceRefresh: operation === "refresh" && forceRefresh,
        embeddingConfig: topicEmbeddingConfigSchema.parse({
          embeddingDimensions: Number(dimensions),
        }),
        ...(operation !== "recluster" && selectedRule && matchesRule(criteria)
          ? { ruleId: selectedRule.id }
          : {}),
      };
      const values = (() => {
        if (operation === "recluster")
          return { ...base, operation, sourceExecutionIds: selectedSourceIds };
        if (!selection?.count)
          throw new Error("Preview and select traces before running Topics.");
        const traceInput =
          "traceIds" in selection
            ? { traceIds: selection.traceIds }
            : { selection: selection.selection };
        if (operation === "assign")
          return {
            ...base,
            operation,
            ...traceInput,
            targetRunIds: selectedTargetRunIds,
          };
        if (operation === "discover")
          return { ...base, operation, ...traceInput };
        return { ...base, operation, ...traceInput };
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
  const renderConfiguration = (
    selection: TopicTraceSelection | null,
    criteria: TopicTraceCriteria | null,
    traceControls: ReactNode,
  ) =>
    render(
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfigurationOpen(true)}
        >
          Configure topics
        </Button>

        <Button
          size="sm"
          disabled={
            !canWrite ||
            !embeddingConfig.success ||
            (operation !== "assign" && !minimumTraceCountResult.success) ||
            trigger.isPending ||
            !facetVersionIds.length ||
            (operation === "recluster"
              ? !selectedSourceIds.length
              : !selection?.count) ||
            (operation === "assign" &&
              facetVersionIds.some((id) => !selectedTargetRunIds[id]))
          }
          onClick={() => submit(selection, criteria)}
        >
          {trigger.isPending ? "Starting…" : "Run topics"}
        </Button>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </>,
      <Dialog open={configurationOpen} onOpenChange={setConfigurationOpen}>
        <DialogContent
          size="xl"
          className="ph-no-capture max-w-6xl"
          closeOnInteractionOutside
        >
          <DialogHeader>
            <DialogTitle>Configure topics</DialogTitle>
            <DialogDescription>
              Choose traces, facets, and processing settings for your next run.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="gap-6">
            {operationControls}
            {traceControls}
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
                    <Select
                      value={version.id}
                      onValueChange={(value) =>
                        setFacetVersions((current) => ({
                          ...current,
                          [facet.id]: value,
                        }))
                      }
                    >
                      <SelectTrigger
                        className="w-24"
                        aria-label={`Version for ${facet.name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="ph-no-capture">
                        {facet.versions.map((candidate) => (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            v{candidate.version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {version.prompt}
                  </p>
                  {operation === "assign" && selected && (
                    <Select
                      value={selectedTargetRunIds[version.id] ?? ""}
                      onValueChange={(value) =>
                        setTargetRunIds((current) => ({
                          ...current,
                          [version.id]: value,
                        }))
                      }
                    >
                      <SelectTrigger
                        className="w-full sm:w-64"
                        aria-label={`Map for ${facet.name} v${version.version}`}
                      >
                        <SelectValue placeholder="Select compatible published map" />
                      </SelectTrigger>
                      <SelectContent className="ph-no-capture">
                        {compatibleRuns
                          .filter(
                            (run) =>
                              run.facetVersionId === version.id &&
                              run.publishedAt,
                          )
                          .map((run) => (
                            <SelectItem key={run.id} value={run.id}>
                              Map {run.runSequence} · {run.topics.length} topics
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </fieldset>
            {operation !== "recluster" && criteria && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-sm">
                    Rule name
                    <Input
                      aria-label="Topic rule name"
                      className="w-64"
                      placeholder="Save these filters and facets"
                      value={ruleName}
                      onChange={(event) => setRuleName(event.target.value)}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      !canWrite ||
                      !ruleName.trim() ||
                      !activeFacetIds.length ||
                      saveRule.isPending
                    }
                    onClick={() =>
                      saveRule.mutate({
                        projectId,
                        ...(selectedRule ? { id: selectedRule.id } : {}),
                        name: ruleName,
                        ...criteria,
                        facetIds: activeFacetIds,
                      })
                    }
                  >
                    {saveRule.isPending
                      ? "Saving…"
                      : selectedRule
                        ? "Update rule"
                        : "Save rule"}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Rules save filters, sampling and selected facets. Choose the
                  time range for each run. Changing a rule reuses existing
                  summaries and embeddings when the trace and facet prompt
                  match.
                  {selectedRule && !matchesRule(criteria)
                    ? " Unsaved changes apply only to this run until you update the rule."
                    : ""}
                </p>
                {saveRule.error && (
                  <p role="alert" className="text-destructive text-sm">
                    {saveRule.error.message}
                  </p>
                )}
              </div>
            )}
            {operation === "recluster" && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-bold">
                  Completed batches to combine
                </legend>
                {reclusterSources.map((execution) => (
                  <label
                    key={execution.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={sourceExecutionIds.includes(execution.id)}
                      onCheckedChange={(checked) =>
                        setSourceExecutionIds((current) =>
                          checked
                            ? [...current, execution.id]
                            : current.filter((id) => id !== execution.id),
                        )
                      }
                    />
                    {execution.input.operation} ·{" "}
                    {new Date(execution.createdAt).toLocaleString()}
                  </label>
                ))}
                <p className="text-muted-foreground text-xs">
                  Only completed batches containing every selected facet version
                  are shown. Reuses retained summaries and embeddings; naming
                  can make a model call.
                </p>
                {reclusterSources.length === 0 && (
                  <p className="text-sm">
                    No compatible batches. Select the facet versions used by a
                    previous batch, or discover topics with new traces first.
                  </p>
                )}
              </fieldset>
            )}
            <div className="flex flex-wrap items-end gap-5">
              {operation !== "assign" && (
                <label className="flex flex-col gap-1 text-sm">
                  Minimum traces for clustering
                  <Input
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
                <Input
                  aria-label="Embedding dimensions"
                  className="w-28"
                  type="number"
                  min={16}
                  max={1536}
                  step={1}
                  value={dimensions}
                  onChange={(event) => setDimensions(event.target.value)}
                />
              </label>
              {operation === "refresh" && (
                <label className="flex h-8 items-center gap-2 text-sm">
                  <Checkbox
                    checked={forceRefresh}
                    onCheckedChange={(value) => setForceRefresh(value === true)}
                  />
                  Force refresh
                </label>
              )}
              {operation !== "assign" && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={exploratory}
                    onCheckedChange={(value) => setExploratory(value === true)}
                  />
                  Small sample mode (smaller, provisional topics)
                </label>
              )}
            </div>
            {operation !== "recluster" && selection?.count ? (
              <p className="text-muted-foreground text-sm">
                Run on {selection.count.toLocaleString()} traces across{" "}
                {facetVersionIds.length} facets. Existing summaries are reused
                when their inputs match. Uncached inputs and outputs are sent to
                OpenAI.
              </p>
            ) : null}
            {operation === "refresh" && (
              <p className="text-muted-foreground text-xs">
                Selected traces join the existing cohort. Topics refresh when
                the cohort changes enough; force refresh rebuilds the map from
                cached summaries.
                {retainedCohort &&
                  ` ${retainedCohort.size.toLocaleString()} previously processed traces across the selected facet versions.`}
              </p>
            )}
            {operation !== "assign" && (
              <p className="text-muted-foreground text-xs">
                {minimumTraceCountResult.success
                  ? `Clustering starts with at least ${minimumTraceCountResult.data.toLocaleString()} usable trace summaries per facet. Below this minimum, summaries are saved for a later run.`
                  : "Enter a whole number of at least 3 traces."}{" "}
                Small sample mode lowers the minimum topic size from 15 to 3
                traces.
              </p>
            )}
            {facetEditor}
          </DialogBody>
          <DialogFooter>
            <Button
              className="self-end"
              variant="outline"
              onClick={() => setConfigurationOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
  const operationControls = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={operation}
          onValueChange={(value) => {
            setOperation(value as TopicOperation);
            setError(null);
            if (value === "assign") utils.topics.runs.invalidate({ projectId });
            if (value === "recluster")
              utils.topics.executions.invalidate({ projectId });
          }}
        >
          <SelectTrigger className="w-64" aria-label="Pipeline operation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="ph-no-capture">
            <SelectItem value="refresh">Update topics</SelectItem>
            <SelectItem value="discover">Discover a new topic map</SelectItem>
            <SelectItem value="assign">
              Assign traces to an existing map
            </SelectItem>
            <SelectItem value="recluster">
              Recluster cached summaries
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {operation !== "recluster" && (
        <label className="flex flex-col gap-1 text-sm">
          Topic rule
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
                    facet.versions[0]?.id ?? "",
                  ]),
                ),
              );
              setSelector((current) => ({
                key: current.key + 1,
                initialCriteria: rule
                  ? {
                      filter: rule.filter,
                      sampling: rule.sampling,
                      limit: rule.limit,
                    }
                  : undefined,
              }));
              saveRule.reset();
            }}
          >
            <SelectTrigger className="w-64" aria-label="Topic rule">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="ph-no-capture">
              <SelectItem value="adhoc">Ad hoc selection</SelectItem>
              {rules.data?.map((rule) => (
                <SelectItem key={rule.id} value={rule.id}>
                  {rule.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rules.error && (
            <span role="alert" className="text-destructive text-sm">
              Could not load saved rules. Ad hoc selection is still available.
            </span>
          )}
        </label>
      )}
    </>
  );
  return operation === "recluster" ? (
    renderConfiguration(null, null, null)
  ) : (
    <TopicTraceSelector
      key={selector.key}
      projectId={projectId}
      initialCriteria={selector.initialCriteria}
      onOpenTrace={() => setConfigurationOpen(false)}
    >
      {renderConfiguration}
    </TopicTraceSelector>
  );
}
